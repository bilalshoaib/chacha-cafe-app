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
export async function withTenant(ctx, fn) {
  const tenantId = ctx?.tenantId
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('withTenant requires a tenantId — refusing to query without one.')
  }
  return withTransaction(async (client) => {
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId])
    // Step down into a role without BYPASSRLS, so the policies apply. The
    // connecting role is Neon's owner, which bypasses them all; migrations
    // need that reach, tenant-scoped queries must not have it. LOCAL, so it
    // ends with the transaction and cannot ride a pooled connection onward.
    await client.query('SET LOCAL ROLE app_tenant')
    return fn(client)
  })
}
