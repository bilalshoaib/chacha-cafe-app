import { randomUUID, randomInt } from 'crypto'
import bcrypt from 'bcryptjs'
import { pool, withTransaction } from '../db.js'
import { starterMenu } from '../../constants/starterMenus.js'

const BCRYPT_ROUNDS = 10

/**
 * Platform-level access to every café on the system.
 *
 * These functions run as the connecting role rather than through withTenant(),
 * because they operate above any single tenant — creating one, listing them,
 * suspending one. That is also why the tenants table carries no row level
 * security: it is the one table the platform legitimately reads across.
 *
 * Nothing here reads a café's own data. Support work that needs to see inside
 * a tenant goes through impersonation, which sets a real tenant context and
 * uses the ordinary, already-tested queries.
 */

export function slugify(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * A password that can be read down a phone line without ambiguity — no
 * characters that look like one another, and grouped so it can be dictated.
 * Shown to the platform owner once, to hand over; the café changes it on
 * first sign-in.
 */
function temporaryPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const pick = (n) => Array.from({ length: n }, () => alphabet[randomInt(alphabet.length)]).join('')
  return `${pick(4)}-${pick(4)}-${pick(4)}`
}

function rowToTenant(row) {
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    plan: row.plan,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    locationCount: row.location_count != null ? Number(row.location_count) : undefined,
    brandCount: row.brand_count != null ? Number(row.brand_count) : undefined,
    userCount: row.user_count != null ? Number(row.user_count) : undefined,
    invoiceCount: row.invoice_count != null ? Number(row.invoice_count) : undefined,
    lastOrderAt: row.last_order_at ? new Date(row.last_order_at).toISOString() : null,
  }
}

/**
 * Every café, with enough activity to tell a working one from a dormant one at
 * a glance. Counted per tenant in one pass rather than per row in the page.
 */
export async function listTenants() {
  const res = await pool.query(`
    SELECT t.*,
           (SELECT COUNT(*) FROM locations l WHERE l.tenant_id = t.id) AS location_count,
           (SELECT COUNT(*) FROM brands   b WHERE b.tenant_id = t.id) AS brand_count,
           (SELECT COUNT(*) FROM users    u WHERE u.tenant_id = t.id) AS user_count,
           (SELECT COUNT(*) FROM invoices i WHERE i.tenant_id = t.id) AS invoice_count,
           (SELECT MAX(i.created_at) FROM invoices i WHERE i.tenant_id = t.id) AS last_order_at
      FROM tenants t
     ORDER BY t.created_at DESC`)
  return res.rows.map(rowToTenant)
}

export async function getTenant(id) {
  const res = await pool.query(`
    SELECT t.*,
           (SELECT COUNT(*) FROM locations l WHERE l.tenant_id = t.id) AS location_count,
           (SELECT COUNT(*) FROM brands   b WHERE b.tenant_id = t.id) AS brand_count,
           (SELECT COUNT(*) FROM users    u WHERE u.tenant_id = t.id) AS user_count,
           (SELECT COUNT(*) FROM invoices i WHERE i.tenant_id = t.id) AS invoice_count,
           (SELECT MAX(i.created_at) FROM invoices i WHERE i.tenant_id = t.id) AS last_order_at
      FROM tenants t WHERE t.id = $1`, [id])
  return rowToTenant(res.rows[0])
}

const STATUSES = ['active', 'trial', 'suspended']
const PLANS = ['trial', 'standard', 'multi-branch']

export async function updateTenant(id, fields) {
  const sets = []
  const vals = []

  if (fields.status !== undefined) {
    if (!STATUSES.includes(fields.status)) return { error: `Status must be one of ${STATUSES.join(', ')}.` }
    vals.push(fields.status); sets.push(`status = $${vals.length}`)
  }
  if (fields.plan !== undefined) {
    if (!PLANS.includes(fields.plan)) return { error: `Plan must be one of ${PLANS.join(', ')}.` }
    vals.push(fields.plan); sets.push(`plan = $${vals.length}`)
  }
  if (fields.name !== undefined) {
    const name = String(fields.name).trim().slice(0, 120)
    if (!name) return { error: 'Name cannot be empty.' }
    vals.push(name); sets.push(`name = $${vals.length}`)
  }
  if (!sets.length) return { tenant: await getTenant(id) }

  vals.push(id)
  const res = await pool.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id`, vals)
  if (!res.rowCount) return { error: 'Café not found.' }
  return { tenant: await getTenant(id) }
}

/**
 * Creates a café and everything it needs to be usable.
 *
 * All of it in one transaction, because a tenant that arrives without a
 * location, a brand or an owner account is not a café that someone can start
 * using — it is a support ticket. Half-created is worse than not created.
 *
 * `brandNames` is the answer to the only question about shape that cannot be
 * deferred: one menu, or separate counters. Empty means one, and that brand
 * takes the café's own name so the concept never surfaces in the interface.
 *
 * Returns { tenant, owner } where owner carries a temporary password to hand
 * over. It exists only in this response — the stored value is a hash.
 */
export async function createTenant(input) {
  const name = String(input?.name ?? '').trim().slice(0, 120)
  if (!name) return { error: 'Enter the business name.' }

  const slug = slugify(input?.slug || name)
  if (!slug) return { error: 'Enter a URL name using letters or numbers.' }

  const ownerEmail = String(input?.ownerEmail ?? '').trim().toLowerCase().slice(0, 120)
  if (!ownerEmail.includes('@')) return { error: 'Enter a valid owner email address.' }

  const plan = PLANS.includes(input?.plan) ? input.plan : 'trial'

  const brandNames = (Array.isArray(input?.brandNames) ? input.brandNames : [])
    .map((b) => String(b).trim().slice(0, 80))
    .filter(Boolean)

  const menu = starterMenu(input?.starterMenu)
  const timezone = String(input?.timezone || 'Asia/Karachi').slice(0, 60)
  const currency = String(input?.currency || 'PKR').toUpperCase().slice(0, 3)
  const locale = String(input?.locale || 'en-PK').slice(0, 10)

  const dupSlug = await pool.query('SELECT id FROM tenants WHERE slug = $1', [slug])
  if (dupSlug.rowCount) return { error: `The URL name "${slug}" is already taken.` }

  const dupEmail = await pool.query('SELECT id FROM users WHERE email = $1', [ownerEmail])
  if (dupEmail.rowCount) return { error: 'An account with this email already exists.' }

  const tenantId = `t-${randomUUID().slice(0, 8)}`
  const locationId = `loc-${randomUUID().slice(0, 8)}`
  const ownerId = `usr-${randomUUID().slice(0, 8)}`
  const password = temporaryPassword()
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO tenants (id, slug, name, status, plan) VALUES ($1,$2,$3,$4,$5)`,
      [tenantId, slug, name, plan === 'trial' ? 'trial' : 'active', plan],
    )

    // Every café has at least one branch, whether or not its owner thinks in
    // branches. The code is what invoice numbers will be built from.
    await client.query(
      `INSERT INTO locations (id, tenant_id, name, code, timezone, currency, locale)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [locationId, tenantId, 'Main Branch', 'MAIN', timezone, currency, locale],
    )

    // One brand named after the café, unless the owner said there are several.
    // Either way a brand exists, so every menu item and invoice can point at
    // one and switching to several later is an interface change, not a
    // migration.
    const brands = brandNames.length ? brandNames : [name]
    for (const [i, brandName] of brands.entries()) {
      await client.query(
        `INSERT INTO brands (id, tenant_id, name, slug, sort_order) VALUES ($1,$2,$3,$4,$5)`,
        [`br-${randomUUID().slice(0, 8)}`, tenantId, brandName, slugify(brandName) || `brand-${i + 1}`, i + 1],
      )
    }

    for (const [i, c] of menu.categories.entries()) {
      await client.query(
        `INSERT INTO categories (id, tenant_id, key, label, icon, color, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [`cat-${randomUUID().slice(0, 8)}`, tenantId, c.key, c.label, c.icon, c.color, i + 1],
      )
    }

    await client.query(
      `INSERT INTO users (id, email, password_hash, role, display_name, tenant_id, created_by)
       VALUES ($1,$2,$3,'super_admin',$4,$5,$6)`,
      [ownerId, ownerEmail, passwordHash, input?.ownerName?.trim()?.slice(0, 80) || null, tenantId, input?.createdBy ?? null],
    )

    // location_id NULL: the owner sees every branch, including ones not opened yet.
    await client.query(
      `INSERT INTO memberships (id, user_id, tenant_id, location_id, role)
       VALUES ($1,$2,$3,NULL,'tenant_owner')`,
      [`mem-${randomUUID().slice(0, 8)}`, ownerId, tenantId],
    )
  })

  return {
    tenant: await getTenant(tenantId),
    owner: { id: ownerId, email: ownerEmail, temporaryPassword: password },
  }
}

/** Whether a café may currently be used. Suspension blocks sign-in, not data. */
export async function isTenantActive(tenantId) {
  const res = await pool.query('SELECT status FROM tenants WHERE id = $1', [tenantId])
  return res.rows[0] ? res.rows[0].status !== 'suspended' : false
}

/**
 * Activity across every café, for the platform's own view of its business.
 *
 * Aggregates only — counts and sums grouped by tenant, never individual rows.
 * That is the whole reason this is safe to run across tenants at all: there is
 * no query here that could return one café's invoices to somebody looking at
 * another, because it does not return invoices.
 *
 * Money is deliberately *not* totalled across cafés. Revenue is denominated in
 * whatever currency each café trades in, and adding rupees to pounds produces
 * a number that looks authoritative and means nothing. Each café's takings are
 * reported in its own currency, and the platform headline groups the totals by
 * currency rather than collapsing them.
 *
 * `since` bounds the activity window; the café's own totals are all-time.
 */
export async function platformActivity(since) {
  const res = await pool.query(`
    SELECT t.id, t.name, t.slug, t.status, t.plan, t.created_at,
           -- One café can in principle have branches in different currencies.
           -- Reporting the first is honest for the overwhelmingly common case
           -- and never silently adds two together.
           (SELECT l.currency FROM locations l
             WHERE l.tenant_id = t.id ORDER BY l.created_at LIMIT 1) AS currency,
           (SELECT COUNT(*) FROM locations l WHERE l.tenant_id = t.id)     AS location_count,
           (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id)         AS user_count,
           COUNT(i.id) FILTER (WHERE i.created_at >= $1)                   AS period_invoices,
           COALESCE(SUM(i.total) FILTER (
             WHERE i.created_at >= $1 AND i.returned = FALSE), 0)          AS period_revenue,
           COUNT(i.id)                                                     AS invoice_count,
           MAX(i.created_at)                                               AS last_order_at
      FROM tenants t
      LEFT JOIN invoices i ON i.tenant_id = t.id
     GROUP BY t.id
     ORDER BY MAX(i.created_at) DESC NULLS LAST, t.created_at DESC`, [since])

  const cafes = res.rows.map((r) => ({
    id: r.id, name: r.name, slug: r.slug, status: r.status, plan: r.plan,
    currency: r.currency ?? 'PKR',
    locationCount: Number(r.location_count),
    userCount: Number(r.user_count),
    invoiceCount: Number(r.invoice_count),
    periodInvoices: Number(r.period_invoices),
    periodRevenue: Math.round(Number(r.period_revenue) * 100) / 100,
    lastOrderAt: r.last_order_at ? new Date(r.last_order_at).toISOString() : null,
    createdAt: r.created_at.toISOString(),
  }))

  const revenueByCurrency = {}
  for (const c of cafes) {
    revenueByCurrency[c.currency] = Math.round(
      ((revenueByCurrency[c.currency] ?? 0) + c.periodRevenue) * 100) / 100
  }

  // "Quiet" is the number worth surfacing: a café that has stopped taking
  // orders is the one a support conversation should start from, and it is
  // invisible in a list sorted by name.
  const quiet = cafes.filter((c) => c.status !== 'suspended' && c.periodInvoices === 0).length

  return {
    since,
    cafes,
    totals: {
      cafeCount: cafes.length,
      activeCount: cafes.filter((c) => c.status === 'active').length,
      trialCount: cafes.filter((c) => c.status === 'trial').length,
      suspendedCount: cafes.filter((c) => c.status === 'suspended').length,
      quietCount: quiet,
      periodInvoices: cafes.reduce((n, c) => n + c.periodInvoices, 0),
      revenueByCurrency,
    },
  }
}

/**
 * Issues a new sign-in password for a café's owner and returns it once.
 *
 * There is no way to show the existing one: what is stored is a bcrypt hash,
 * which is the entire point of storing it that way. So the honest support
 * answer to "what is their password" is to set a new one and hand it over —
 * the same thing that happens when a real customer forgets theirs.
 *
 * The owner is the account holding the tenant_owner membership. A café always
 * has exactly one at creation; if somebody has since been promoted, the
 * earliest is chosen so the answer is stable between calls.
 */
export async function resetOwnerPassword(tenantId) {
  const res = await pool.query(
    `SELECT u.id, u.email
       FROM users u
       JOIN memberships m ON m.user_id = u.id AND m.tenant_id = u.tenant_id
      WHERE u.tenant_id = $1 AND m.role = 'tenant_owner'
      ORDER BY u.created_at
      LIMIT 1`,
    [tenantId],
  )
  if (!res.rows.length) return { error: 'This café has no owner account to reset.' }

  const password = temporaryPassword()
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2',
    [await bcrypt.hash(password, BCRYPT_ROUNDS), res.rows[0].id])

  return { owner: { id: res.rows[0].id, email: res.rows[0].email, temporaryPassword: password } }
}

/** The café's owner, for showing who a reset would affect. */
export async function getTenantOwner(tenantId) {
  const res = await pool.query(
    `SELECT u.email
       FROM users u
       JOIN memberships m ON m.user_id = u.id AND m.tenant_id = u.tenant_id
      WHERE u.tenant_id = $1 AND m.role = 'tenant_owner'
      ORDER BY u.created_at LIMIT 1`,
    [tenantId],
  )
  return res.rows[0]?.email ?? null
}
