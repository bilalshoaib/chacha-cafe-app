import { randomUUID, randomInt } from 'crypto'
import bcrypt from 'bcryptjs'
import { pool, withTransaction } from '../db.js'
import { starterMenu } from '../../constants/starterMenus.js'
import { tenantAccess, trialEndFromDays, TRIAL_DAYS_DEFAULT } from '../tenantAccess.js'
import { parseHour, tradingDay, DEFAULT_DAY_START_HOUR, DEFAULT_DAY_END_HOUR } from '../tradingDay.js'

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
    // The three columns the access rule reads. They travel with the tenant
    // everywhere it is read, so the console's badge and the gate that turns
    // somebody away are looking at the same row.
    trialEndsAt: row.trial_ends_at instanceof Date ? row.trial_ends_at.toISOString() : (row.trial_ends_at ?? null),
    restrictedAt: row.restricted_at instanceof Date ? row.restricted_at.toISOString() : (row.restricted_at ?? null),
    restrictedReason: row.restricted_reason ?? null,
    // null means "no price of its own" — the plan's price applies. Distinct
    // from 0, which is a café that pays nothing on purpose.
    monthlyPrice: row.monthly_price == null ? null : Number(row.monthly_price),
    // Branding travels with the tenant everywhere it is read, so the console's
    // edit form is filled from the same row the app skins itself from and the
    // two can never drift.
    tagline: row.tagline ?? null,
    brandPrimary: row.brand_primary ?? null,
    brandSecondary: row.brand_secondary ?? null,
    logoUrl: row.logo_url ?? null,
    receiptFooter: row.receipt_footer ?? null,
    // When their day opens and closes. Read by the till when it stamps an
    // invoice with the day it belongs to, and by the reports screen when it
    // works out what "today" covers.
    dayStartHour: row.day_start_hour == null ? DEFAULT_DAY_START_HOUR : Number(row.day_start_hour),
    dayEndHour: row.day_end_hour == null ? DEFAULT_DAY_END_HOUR : Number(row.day_end_hour),
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

const STATUSES = ['active', 'trial', 'restricted', 'suspended']
const PLANS = ['trial', 'standard', 'multi-branch']

/**
 * A brand colour, or an error.
 *
 * Only six-digit hex is accepted. The value is written straight into a
 * `:root{--brand-primary:…}` style block by app/layout.jsx, so anything that
 * is not a colour is a way to close that rule early and write CSS of one's
 * choosing into every page the café serves. Three-digit and eight-digit hex
 * would both be valid CSS; they are refused anyway, because the colour inputs
 * emit six digits and a narrower rule here is one that cannot be argued with.
 *
 * Empty clears the colour, which is how a café goes back to the product's own
 * palette rather than being stuck with whatever was set once.
 */
const HEX_COLOUR = /^#[0-9a-f]{6}$/i

function parseColour(value, label) {
  const raw = String(value ?? '').trim()
  if (!raw) return { value: null }
  if (!HEX_COLOUR.test(raw)) {
    return { error: `${label} must be a colour like #0d9488.` }
  }
  return { value: raw.toLowerCase() }
}

/** Trimmed and length-capped, with empty meaning "clear it". */
function parseOptionalText(value, max) {
  const raw = String(value ?? '').trim().slice(0, max)
  return raw || null
}

/**
 * Everything about a café the platform can change from the console.
 *
 * This used to take name, plan and status only, on the reasoning that a café's
 * own configuration belongs to its owner. That reasoning does not survive
 * contact with support: the owner who wants their colours changed asks the
 * person who sold them the product, and answering "sign in and do it yourself"
 * to somebody running a till is not support. So the console can now set the
 * whole identity, and the café's own settings remain the ordinary way to do it.
 *
 * Every field is optional and absent means unchanged — an empty string is a
 * deliberate clear, which is why the checks below test against `undefined`
 * rather than falsiness.
 */
export async function updateTenant(id, fields) {
  const sets = []
  const vals = []

  if (fields.status !== undefined) {
    if (!STATUSES.includes(fields.status)) return { error: `Status must be one of ${STATUSES.join(', ')}.` }
    vals.push(fields.status); sets.push(`status = $${vals.length}`)
    // Restricting stamps when; anything else clears the stamp and the reason
    // with it, so a café that is let back in is not still carrying the note
    // that said why it was stopped.
    if (fields.status === 'restricted') {
      sets.push('restricted_at = NOW()')
    } else {
      sets.push('restricted_at = NULL')
      if (fields.restrictedReason === undefined) sets.push('restricted_reason = NULL')
    }
  }
  if (fields.monthlyPrice !== undefined) {
    if (fields.monthlyPrice === null || fields.monthlyPrice === '') {
      sets.push('monthly_price = NULL')
    } else {
      const amount = Number(fields.monthlyPrice)
      if (!Number.isFinite(amount) || amount < 0) return { error: 'A price must be a number of 0 or more.' }
      vals.push(amount); sets.push(`monthly_price = $${vals.length}`)
    }
  }
  if (fields.restrictedReason !== undefined) {
    vals.push(parseOptionalText(fields.restrictedReason, 200)); sets.push(`restricted_reason = $${vals.length}`)
  }
  // The trading day. Refused rather than clamped: an hour of 25 is a mistake
  // somewhere upstream, and silently storing 23 would move a café's day
  // boundary without anybody being told. The two are independent — a café that
  // only wants to move its opening hour sends one — and equal hours are legal,
  // meaning a day that runs the full twenty-four.
  for (const [field, column] of [['dayStartHour', 'day_start_hour'], ['dayEndHour', 'day_end_hour']]) {
    if (fields[field] === undefined) continue
    const hour = parseHour(fields[field])
    if (hour == null) return { error: 'The trading day must be a whole hour between 0 and 23.' }
    vals.push(hour); sets.push(`${column} = $${vals.length}`)
  }
  // Two ways to say the same thing: a length in days, which is what the console
  // asks for, or an explicit instant. `null` ends the trial's clock without
  // ending the trial — an unlimited trial, which is what every café had before
  // this existed and so has to stay expressible.
  if (fields.trialDays !== undefined) {
    const parsed = trialEndFromDays(fields.trialDays)
    if (parsed.error) return { error: parsed.error }
    vals.push(parsed.value); sets.push(`trial_ends_at = $${vals.length}`)
  } else if (fields.trialEndsAt !== undefined) {
    if (fields.trialEndsAt === null) {
      sets.push('trial_ends_at = NULL')
    } else {
      const at = new Date(fields.trialEndsAt)
      if (Number.isNaN(at.getTime())) return { error: 'Trial end must be a date.' }
      vals.push(at.toISOString()); sets.push(`trial_ends_at = $${vals.length}`)
    }
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
  if (fields.slug !== undefined) {
    const slug = slugify(fields.slug)
    if (!slug) return { error: 'The URL name needs at least one letter or number.' }
    // Checked before the write rather than caught after it: the unique
    // constraint's message names a Postgres index, which is not something to
    // put in front of somebody renaming a café.
    const dup = await pool.query('SELECT id FROM tenants WHERE slug = $1 AND id <> $2', [slug, id])
    if (dup.rowCount) return { error: `The URL name "${slug}" is already taken.` }
    vals.push(slug); sets.push(`slug = $${vals.length}`)
  }
  if (fields.tagline !== undefined) {
    vals.push(parseOptionalText(fields.tagline, 160)); sets.push(`tagline = $${vals.length}`)
  }
  if (fields.receiptFooter !== undefined) {
    vals.push(parseOptionalText(fields.receiptFooter, 200)); sets.push(`receipt_footer = $${vals.length}`)
  }
  if (fields.brandPrimary !== undefined) {
    const parsed = parseColour(fields.brandPrimary, 'The main colour')
    if (parsed.error) return { error: parsed.error }
    vals.push(parsed.value); sets.push(`brand_primary = $${vals.length}`)
  }
  if (fields.brandSecondary !== undefined) {
    const parsed = parseColour(fields.brandSecondary, 'The accent colour')
    if (parsed.error) return { error: parsed.error }
    vals.push(parsed.value); sets.push(`brand_secondary = $${vals.length}`)
  }
  if (!sets.length) return { tenant: await getTenant(id) }

  vals.push(id)
  const res = await pool.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id`, vals)
  if (!res.rowCount) return { error: 'Café not found.' }
  // Status and the trial clock are both in here, so any write can be the one
  // that changes whether this café may be used.
  forgetTenantAccess(id)
  return { tenant: await getTenant(id) }
}

/**
 * What may be uploaded as a logo.
 *
 * SVG is included because that is what a designer hands over, and excluded
 * from nothing else than caution — the route that serves these sets a
 * `default-src 'none'` policy on the response, so a script smuggled inside one
 * has nothing it is allowed to do. Without that header an SVG served from the
 * app's own origin is a stored cross-site scripting hole, so the two changes
 * belong together and neither should be made without the other.
 */
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])

/**
 * 512 KB, measured after decoding.
 *
 * Generous for a logo and small enough that a row stays cheap to read. The
 * limit is enforced here rather than only in the browser, because the browser
 * is not the only thing that can POST to the route.
 */
const LOGO_MAX_BYTES = 512 * 1024

/**
 * Stores a café's logo and points its logo_url at the route that serves it.
 *
 * The URL carries the upload's timestamp, which is what lets that route be
 * cached hard: the path changes whenever the picture does, so a replaced logo
 * appears at once instead of waiting out somebody's cache, and an unchanged
 * one is never fetched twice.
 *
 * `data` is base64 — the form reads the file with FileReader and posts JSON,
 * which keeps this route the same shape as every other one in the app.
 */
export async function setTenantLogo(id, { mime, data }) {
  if (!LOGO_TYPES.has(mime)) {
    return { error: 'The logo must be a PNG, JPEG, WebP or SVG file.' }
  }
  let bytes
  try {
    bytes = Buffer.from(String(data ?? ''), 'base64')
  } catch {
    return { error: 'That file could not be read.' }
  }
  if (!bytes.length) return { error: 'That file is empty.' }
  if (bytes.length > LOGO_MAX_BYTES) {
    return { error: `The logo must be under ${Math.round(LOGO_MAX_BYTES / 1024)} KB — this one is ${Math.round(bytes.length / 1024)} KB.` }
  }

  const tenant = await getTenant(id)
  if (!tenant) return { error: 'Café not found.' }

  const url = await withTransaction(async (client) => {
    const stamp = await client.query(
      `INSERT INTO tenant_logos (tenant_id, mime, bytes, updated_at)
            VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tenant_id)
       DO UPDATE SET mime = EXCLUDED.mime, bytes = EXCLUDED.bytes, updated_at = NOW()
         RETURNING updated_at`,
      [id, mime, bytes],
    )
    const version = new Date(stamp.rows[0].updated_at).getTime()
    const logoUrl = `/api/branding/${id}/logo?v=${version}`
    await client.query('UPDATE tenants SET logo_url = $1 WHERE id = $2', [logoUrl, id])
    return logoUrl
  })

  return { tenant: await getTenant(id), logoUrl: url }
}

/** Removes the logo and the pointer to it, together. */
export async function clearTenantLogo(id) {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM tenant_logos WHERE tenant_id = $1', [id])
    await client.query('UPDATE tenants SET logo_url = NULL WHERE id = $1', [id])
  })
  return { tenant: await getTenant(id) }
}

/** The stored logo, for the route that serves it. Null when there is none. */
export async function getTenantLogo(id) {
  const res = await pool.query(
    'SELECT mime, bytes, updated_at FROM tenant_logos WHERE tenant_id = $1', [id])
  const row = res.rows[0]
  return row ? { mime: row.mime, bytes: row.bytes, updatedAt: row.updated_at } : null
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

  // A trial is given a clock at the moment it is created. Only a trial gets
  // one: a paid café that is later put back on trial is given its length then,
  // and until it is, the trial runs unlimited rather than being born expired.
  let trialEndsAt = null
  if (plan === 'trial') {
    const parsed = trialEndFromDays(input?.trialDays ?? TRIAL_DAYS_DEFAULT)
    if (parsed.error) return { error: parsed.error }
    trialEndsAt = parsed.value
  }

  const brandNames = (Array.isArray(input?.brandNames) ? input.brandNames : [])
    .map((b) => String(b).trim().slice(0, 80))
    .filter(Boolean)

  const menu = starterMenu(input?.starterMenu)
  const timezone = String(input?.timezone || 'Asia/Karachi').slice(0, 60)
  const currency = String(input?.currency || 'PKR').toUpperCase().slice(0, 3)
  const locale = String(input?.locale || 'en-PK').slice(0, 10)

  // Branding is optional at creation and null means "the product's palette",
  // which is what getTenantBranding() falls back to. A café created without it
  // therefore looks deliberate rather than unfinished, and the console can set
  // it later without anything having to be migrated.
  const primary = parseColour(input?.brandPrimary, 'The main colour')
  if (primary.error) return { error: primary.error }
  const secondary = parseColour(input?.brandSecondary, 'The accent colour')
  if (secondary.error) return { error: secondary.error }
  const tagline = parseOptionalText(input?.tagline, 160)
  const receiptFooter = parseOptionalText(input?.receiptFooter, 200)

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
      `INSERT INTO tenants (id, slug, name, status, plan,
                            brand_primary, brand_secondary, tagline, receipt_footer, trial_ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [tenantId, slug, name, plan === 'trial' ? 'trial' : 'active', plan,
       primary.value, secondary.value, tagline, receiptFooter, trialEndsAt],
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

  // Outside the transaction on purpose. The café is usable the moment the rows
  // above are committed; a logo that fails to store is a picture to re-upload,
  // not a reason to throw away an account somebody is waiting on. The error is
  // returned alongside the café rather than swallowed, so the console can say
  // so instead of silently showing no logo.
  let logoError = null
  if (input?.logo?.data) {
    const stored = await setTenantLogo(tenantId, input.logo)
    if (stored.error) logoError = stored.error
  }

  return {
    tenant: await getTenant(tenantId),
    owner: { id: ownerId, email: ownerEmail, temporaryPassword: password },
    ...(logoError ? { logoError } : {}),
  }
}

/**
 * Whether a café may currently be used, and why not.
 *
 * requireTenant() calls this on the way in to every request that touches a
 * café's data, which is what makes a restriction bite immediately rather than
 * at the next sign-in. That is also why the answer is cached: requireTenant()
 * reads a cookie and nothing else, and putting an uncached query in front of
 * every API call would add a Neon round trip — most of a second from outside
 * its region — to screens that currently need none.
 *
 * The cache is per-instance and lives for ACCESS_TTL_MS, so the worst case is
 * that a café restricted this second keeps working for a few more. A write
 * through updateTenant() drops its entry, so the console sees its own change
 * take effect at once; another instance still waits out the TTL.
 */
const ACCESS_TTL_MS = 15_000
const accessCache = new Map()

/** Drops a café's cached row, so the next request re-reads it. */
export function forgetTenantAccess(tenantId) {
  accessCache.delete(tenantId)
}

/**
 * The handful of columns every request needs to know about a café: whether it
 * may be used, and when its day turns over.
 *
 * One row, one cache. The trading day is fetched here rather than on its own
 * because the request that wants it — a checkout — has already been through
 * requireTenant(), which filled this entry a moment ago. Asking separately
 * would put a second Neon round trip in front of every order for two small
 * integers that were already in memory.
 */
async function tenantRuntime(tenantId) {
  const hit = accessCache.get(tenantId)
  if (hit && Date.now() - hit.at < ACCESS_TTL_MS) return hit.tenant

  const res = await pool.query(
    `SELECT status, trial_ends_at, restricted_reason, day_start_hour, day_end_hour
       FROM tenants WHERE id = $1`,
    [tenantId],
  )
  const row = res.rows[0]
  const tenant = row
    ? {
        status: row.status,
        trialEndsAt: row.trial_ends_at instanceof Date ? row.trial_ends_at.toISOString() : (row.trial_ends_at ?? null),
        restrictedReason: row.restricted_reason ?? null,
        dayStartHour: row.day_start_hour == null ? null : Number(row.day_start_hour),
        dayEndHour: row.day_end_hour == null ? null : Number(row.day_end_hour),
      }
    : null
  accessCache.set(tenantId, { at: Date.now(), tenant })
  return tenant
}

export async function getTenantAccess(tenantId) {
  return tenantAccess(await tenantRuntime(tenantId))
}

/**
 * When this café's day opens and closes.
 *
 * A café that cannot be found gets the defaults rather than an error: the
 * caller is stamping an invoice, and the request it belongs to has already
 * proved the tenant exists.
 */
export async function getTenantDayHours(tenantId) {
  return tradingDay(await tenantRuntime(tenantId))
}

/** Whether a café may currently be used. Kept for callers that want a boolean. */
export async function isTenantActive(tenantId) {
  return (await getTenantAccess(tenantId)).allowed
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
