import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required.')
}

/**
 * How long a single statement may run before Postgres cancels it.
 *
 * Applied with SET LOCAL inside the transaction wrappers below rather than as
 * a connection parameter, and that is not a style choice: Neon's pooled
 * endpoint accepts `statement_timeout` in the startup packet and then silently
 * ignores it — `SHOW statement_timeout` on a connection that asked for 15s
 * answers 0. A limit that quietly is not there is worse than none, because it
 * is the one you stop thinking about. SET LOCAL takes effect and, being scoped
 * to the transaction, cannot ride a pooled connection to the next caller.
 */
const STATEMENT_TIMEOUT_MS = 15000

/**
 * The client-side backstop, for the plain pool.query() calls that run outside
 * any transaction and so cannot use SET LOCAL.
 *
 * node-postgres times the query itself and destroys the connection if it
 * expires, which is heavier than a server-side cancel — hence the wider
 * margin, so that the server's own timeout is what normally fires. What it
 * buys is that no query can hang forever, which is the property that turns a
 * database blip into a brief error instead of a till frozen until somebody
 * notices.
 */
const QUERY_TIMEOUT_MS = 25000

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  query_timeout: QUERY_TIMEOUT_MS,
  // A serverless instance can be frozen mid-connection and thawed much later,
  // by which point the far end may be long gone. Keepalives are what discover
  // that, rather than the first query after the thaw hanging on a dead socket.
  keepAlive: true,
})

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error', err)
})

export { pool }

export async function withClient(fn) {
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

export async function withTransaction(fn) {
  return withClient(async (client) => {
    await client.query(`BEGIN; SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
    try {
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  })
}

/**
 * Runs `fn` with the current tenant declared to Postgres, inside a transaction.
 *
 * Row level security policies read `app.tenant_id`, so a query issued outside
 * this wrapper sees nothing once the policies are in place. SET LOCAL scopes
 * the setting to the transaction, which means it cannot leak to whatever the
 * connection is handed to next — pooled connections are reused constantly, and
 * a tenant id left behind on one would be the whole bug.
 *
 * The guard is not decoration. `SET LOCAL app.tenant_id = ''` would satisfy
 * every policy comparison against an empty string rather than failing, so an
 * absent tenant has to stop here rather than reach the database.
 */
/**
 * Tenant ids are generated here — `t-` and eight hex characters, or a fixed
 * string in a migration — so anything outside this shape did not come from us
 * and has no business reaching the database.
 *
 * The check earns its place twice over: it rejects a forged id, and it is what
 * makes it safe to put the value into the preamble below as a literal rather
 * than a bound parameter. The character class admits no quote and no
 * backslash, so there is nothing to escape and nothing to break out of.
 */
const TENANT_ID_SHAPE = /^[A-Za-z0-9_-]{1,50}$/

export async function withTenant(ctx, fn) {
  const tenantId = ctx?.tenantId
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('withTenant requires a tenantId — refusing to query without one.')
  }
  if (!TENANT_ID_SHAPE.test(tenantId)) {
    throw new Error(`withTenant received a tenant id of an impossible shape: ${JSON.stringify(tenantId)}`)
  }

  // Step down into a role without BYPASSRLS, so the policies apply. The
  // connecting role is Neon's owner, which bypasses them all; migrations need
  // that reach, tenant-scoped queries must not have it.
  //
  // A read-only context — support looking at a café without having taken
  // control of it — gets a role with no INSERT, UPDATE or DELETE at all.
  // Enforced here rather than by a check in each write route, because a route
  // guard has to be remembered on every route ever added.
  const role = ctx.readOnly ? 'app_tenant_ro' : 'app_tenant'

  // One round trip, not three. Every statement here is LOCAL to the
  // transaction, so none of it can ride a pooled connection onward to the next
  // tenant — which is the property that matters, and is unchanged by sending
  // them together.
  //
  // Worth the trouble: a round trip to Neon from outside its region is a couple
  // of hundred milliseconds, and this used to spend five of them — BEGIN,
  // set_config, SET LOCAL ROLE, the query, COMMIT — before doing any work.
  //
  // The two timeouts ride along in the same packet, so they are free. The
  // second one matters more than it looks: a serverless instance frozen with a
  // transaction open holds its row locks until something closes it, and
  // without this that something is Neon hours later. See STATEMENT_TIMEOUT_MS
  // above for why these are SET LOCAL rather than connection parameters.
  const preamble =
    `BEGIN; SELECT set_config('app.tenant_id', '${tenantId}', true); SET LOCAL ROLE ${role}; ` +
    `SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}; ` +
    `SET LOCAL idle_in_transaction_session_timeout = ${STATEMENT_TIMEOUT_MS}`

  const client = await pool.connect()
  try {
    await client.query(preamble)
    try {
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  } finally {
    client.release()
  }
}
