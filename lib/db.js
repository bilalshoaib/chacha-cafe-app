import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required.')
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
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
    await client.query('BEGIN')
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
  const preamble =
    `BEGIN; SELECT set_config('app.tenant_id', '${tenantId}', true); SET LOCAL ROLE ${role}`

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
