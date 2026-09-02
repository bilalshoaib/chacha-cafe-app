import { readdir, readFile } from 'fs/promises'
import path from 'path'
import pg from 'pg'
import { pool } from './db.js'

const { Client } = pg

// Any bigint; it only has to be the same in every instance so that two booting
// at once serialise instead of racing on the same DDL.
const MIGRATION_LOCK_ID = 4713021

/**
 * How long to keep trying for the migration lock before giving up and letting
 * the instance serve anyway.
 *
 * There is a limit at all because this runs inside instrumentation.js, and
 * Next waits for that before the instance answers its first request. Anything
 * that can block in here can hang a whole instance — a spinning tab, a
 * cashier reloading, nothing in the logs to say why. Waiting a bounded time
 * and then carrying on is the lesser failure: whoever holds the lock is
 * already applying the same migrations, and this instance will see them.
 */
const LOCK_WAIT_MS = 30000
const LOCK_POLL_MS = 500

/** Long enough for a real migration, short enough not to wedge a boot. */
const MIGRATION_STATEMENT_TIMEOUT_MS = 60000

/**
 * Migrations get their own direct connection, not the shared pool.
 *
 * Two reasons, and both bite only in production. The pool points at Neon's
 * pooled endpoint, where a session-level advisory lock is taken on whichever
 * backend the pooler hands out and is not reliably the one a later unlock
 * lands on — a lock that leaks there is held until Neon recycles the backend,
 * and every instance that boots meanwhile waits on it. And a migration holding
 * a pooled connection for its duration is one the rest of the app cannot use.
 *
 * Neon's direct endpoint is the pooled host without the `-pooler` suffix. Set
 * DATABASE_URL_UNPOOLED to override; anything that is not a Neon pooled host
 * is used unchanged.
 */
function migrationConnectionString() {
  if (process.env.DATABASE_URL_UNPOOLED) return process.env.DATABASE_URL_UNPOOLED
  const configured = process.env.DATABASE_URL
  try {
    const url = new URL(configured)
    if (url.hostname.includes('-pooler') && url.hostname.endsWith('.neon.tech')) {
      url.hostname = url.hostname.replace('-pooler', '')
      return url.toString()
    }
  } catch {
    // Not a URL we can take apart. Use it as given.
  }
  return configured
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The migrations that had already run everywhere before this file started
 * tracking them — the hardcoded list the previous version of runMigrations()
 * applied on every boot.
 *
 * On a database that predates schema_migrations these are recorded as applied
 * rather than executed. They are all idempotent, so running them again would
 * work, but each ALTER TABLE still briefly takes an exclusive lock and the
 * café is taking orders on this database. Nothing is gained by touching it.
 *
 * Never add to this list. New migrations belong in migrations/ and run.
 */
const BASELINE = [
  '001_initial.sql',
  '002_payment_method.sql',
  '003_combined_deals.sql',
  '004_deal_status.sql',
  '005_invoice_sequences.sql',
  '006_order_type.sql',
  '007_delivery_charge.sql',
  '008_shift_number.sql',
  '009_cost_price.sql',
  '010_deal_include_unit_price.sql',
]

/**
 * Records the baseline as applied, but only on a database that already has the
 * schema those migrations build. A genuinely empty database (a fresh Neon
 * branch, a new developer's machine) must run them for real, so the presence
 * of the invoices table is what tells the two apart.
 */
async function baselineIfPreExisting(client) {
  const tracked = await client.query('SELECT 1 FROM schema_migrations LIMIT 1')
  if (tracked.rowCount > 0) return

  const schemaExists = await client.query("SELECT to_regclass('public.invoices') IS NOT NULL AS present")
  if (!schemaExists.rows[0].present) return

  await client.query(
    `INSERT INTO schema_migrations (filename)
     SELECT unnest($1::text[]) ON CONFLICT DO NOTHING`,
    [BASELINE],
  )
  console.log(`[db] Existing schema detected — baselined ${BASELINE.length} migrations as already applied.`)
}

/**
 * Which of `files` this database has no record of, or null if it has never been
 * migrated at all — no schema_migrations table yet, so every file is pending
 * and the table has to be created before anything can be recorded.
 */
async function pendingFor(runner, files) {
  try {
    const done = await runner.query('SELECT filename FROM schema_migrations')
    const applied = new Set(done.rows.map((r) => r.filename))
    return files.filter((f) => !applied.has(f))
  } catch (err) {
    if (err.code === '42P01') return null // undefined_table
    throw err
  }
}

/**
 * Applies every migrations/*.sql file that has not run against this database.
 *
 * Files are discovered from disk and applied in filename order, so adding a
 * migration means dropping in a numbered file — there is no list here to keep
 * in step with the directory.
 *
 * The shape of this function is set by where it runs from: instrumentation.js,
 * on every cold start of every serverless instance, with Next holding the
 * instance's first request until it returns. So it is built around one
 * question — is there anything to do — asked as cheaply as it can be:
 *
 *   • The answer costs a single query, and on all but a deploy it is "no" and
 *     nothing else happens. No DDL, no lock, no second connection. This used
 *     to spend five round trips before it could say the same thing, on every
 *     cold start forever, which against Neon is over a second of a customer
 *     waiting at the counter.
 *   • Only when something is actually pending does the rest of the machinery
 *     start, and none of it can block indefinitely. See applyPending().
 *   • schema_migrations records what has run, so a migration executes once
 *     rather than on every boot. The existing files are written to be
 *     idempotent, but that is a property this must not depend on: the
 *     multi-tenant migrations that follow move data, and moving it twice is
 *     not the same as moving it once.
 */
export async function runMigrations() {
  const dir = path.join(process.cwd(), 'migrations')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

  const pending = await pendingFor(pool, files)
  if (pending !== null && pending.length === 0) return

  await applyPending(dir, files)
}

/**
 * The deploy path: take the lock, re-check, apply what is left.
 *
 * Nothing in here waits without a deadline. The lock is taken with
 * pg_try_advisory_lock rather than pg_advisory_lock, which is the whole point:
 * the blocking form has no timeout and no way to pass one, so an instance that
 * asked for a lock somebody else was holding waited for it forever, serving
 * nothing while it did. Polling a non-blocking lock gives the same
 * serialisation with an exit.
 *
 * The connection is closed on the way out whatever happens, which releases the
 * lock even if the unlock never runs.
 */
async function migrationClient() {
  const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
  const direct = migrationConnectionString()

  // The derived direct endpoint is the better connection to migrate on, but it
  // is derived — a guess about Neon's host naming. If it does not answer, the
  // configured URL certainly does, and a migration applied over the pooler is
  // far better than one that never runs because a hostname changed shape.
  for (const [label, connectionString] of [['direct', direct], ['configured', process.env.DATABASE_URL]]) {
    if (!connectionString || (label === 'configured' && connectionString === direct)) continue
    const client = new Client({ connectionString, ssl, connectionTimeoutMillis: 10000 })
    try {
      await client.connect()
      return client
    } catch (err) {
      await client.end().catch(() => {})
      if (label === 'configured') throw err
      console.warn(`[db] Migration connection to the direct endpoint failed (${err.message}); using the configured URL.`)
    }
  }
  throw new Error('No usable database URL for migrations.')
}

async function applyPending(dir, files) {
  const startedAll = performance.now()
  const client = await migrationClient()
  let locked = false
  try {
    // Set rather than passed at connect: Neon accepts statement_timeout as a
    // startup parameter and then ignores it, so a connection that asked for a
    // limit reports none. On this dedicated session a plain SET is honoured.
    await client.query(`SET statement_timeout = ${MIGRATION_STATEMENT_TIMEOUT_MS}`)

    const deadline = Date.now() + LOCK_WAIT_MS
    for (;;) {
      const got = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [MIGRATION_LOCK_ID])
      if (got.rows[0].ok) { locked = true; break }
      if (Date.now() >= deadline) {
        console.warn(
          `[db] Another instance has held the migration lock for ${LOCK_WAIT_MS}ms. ` +
          'Serving without applying migrations — it is applying the same ones.',
        )
        return
      }
      await sleep(LOCK_POLL_MS)
    }

    // Created under the lock, not before it. CREATE TABLE IF NOT EXISTS is not
    // safe to race: two instances that pass the existence check together both
    // proceed to create, and the loser dies on a duplicate key in a catalogue
    // index rather than shrugging the way the IF NOT EXISTS suggests. Six
    // instances booting at once against a fresh database used to leave five of
    // them throwing here.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await baselineIfPreExisting(client)

    // Re-read under the lock. Whoever held it a moment ago was applying these
    // same files, so the list from before the wait may already be stale.
    const pending = (await pendingFor(client, files)) ?? files
    if (pending.length === 0) return

    const marks = []
    for (const file of pending) {
      const started = performance.now()
      const sql = await readFile(path.join(dir, file), 'utf8')

      // Each migration is one transaction: a file that fails part-way leaves
      // nothing behind and is retried whole on the next boot.
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${file} failed: ${err.message}`, { cause: err })
      }
      marks.push(`${file}=${Math.round(performance.now() - started)}ms`)
    }

    console.log(
      `[db] Applied ${pending.length} migration(s) in ` +
      `${Math.round(performance.now() - startedAll)}ms — ${marks.join(' ')}`,
    )
  } finally {
    if (locked) {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {})
    }
    await client.end().catch(() => {})
  }
}
