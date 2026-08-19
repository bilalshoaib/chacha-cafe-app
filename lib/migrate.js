import { readdir, readFile } from 'fs/promises'
import path from 'path'
import { pool } from './db.js'

// Any bigint; it only has to be the same in every instance so that two booting
// at once serialise instead of racing on the same DDL.
const MIGRATION_LOCK_ID = 4713021

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
 * Applies every migrations/*.sql file that has not run against this database.
 *
 * Files are discovered from disk and applied in filename order, so adding a
 * migration means dropping in a numbered file — there is no list here to keep
 * in step with the directory.
 *
 * Two guarantees matter, because this runs on every cold start of every
 * serverless instance:
 *
 *   • An advisory lock serialises concurrent boots. Without it two instances
 *     starting together can run the same DDL at the same time.
 *   • schema_migrations records what has run, so a migration executes once
 *     rather than on every boot. The existing files are written to be
 *     idempotent, but that is a property this must not depend on: the
 *     multi-tenant migrations that follow move data, and moving it twice is
 *     not the same as moving it once.
 */
export async function runMigrations() {
  const startedAll = performance.now()
  const client = await pool.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // Blocks until any other booting instance has finished; released on
    // disconnect even if this process dies mid-migration.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID])

    try {
      await baselineIfPreExisting(client)

      const dir = path.join(process.cwd(), 'migrations')
      const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

      const done = await client.query('SELECT filename FROM schema_migrations')
      const alreadyApplied = new Set(done.rows.map((r) => r.filename))
      const pending = files.filter((f) => !alreadyApplied.has(f))

      if (pending.length === 0) {
        console.log(`[db] Schema up to date — ${files.length} migrations, none pending.`)
        return
      }

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
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID])
    }
  } finally {
    client.release()
  }
}
