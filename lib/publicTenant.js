import { pool } from './db.js'

/**
 * Resolves which café an unauthenticated request is asking about.
 *
 * The public menu has no session to read a tenant from, so it takes one by
 * slug. Until custom domains and subdomains exist, an install with exactly one
 * tenant needs no slug — which keeps the current single-café URL working
 * unchanged.
 *
 * Returns a tenant id, or null when the slug matches nothing or when no slug
 * was given and there is more than one café to choose from. Callers must treat
 * null as "not found" and never as "all tenants".
 */
export async function resolvePublicTenantId(slug) {
  if (slug) {
    const res = await pool.query('SELECT id FROM tenants WHERE slug = $1 AND status <> $2', [slug, 'suspended'])
    return res.rows[0]?.id ?? null
  }
  const res = await pool.query('SELECT id FROM tenants WHERE status <> $1 LIMIT 2', ['suspended'])
  return res.rowCount === 1 ? res.rows[0].id : null
}
