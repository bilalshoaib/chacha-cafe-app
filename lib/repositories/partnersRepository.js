import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { pool, withTenant } from '../db.js'
import { normalizeEmail } from './usersRepository.js'

/**
 * Partner kitchens — see migrations/033_partner_brands.sql and lib/partners.js.
 *
 * A partner is a row in `brands` with `partner` set. The till reads partners
 * and their prices through loadMenu(); what is here is the writing side, plus
 * the partner's own logins.
 */

const BCRYPT_ROUNDS = 10

function rowToPartner(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    supplyDiscountPct: Number(row.supply_discount_pct ?? 0),
  }
}

/** A brand slug from a name: lowercase, hyphenated, at most forty characters. */
export function partnerSlug(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'partner'
}

export async function listPartners(ctx) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `SELECT id, name, slug, supply_discount_pct FROM brands
        WHERE tenant_id = $1 AND partner ORDER BY sort_order, name`,
      [ctx.tenantId],
    )
    return res.rows.map(rowToPartner)
  })
}

/** The café's public slug — what a partner's website names it by. */
export async function getTenantSlug(ctx) {
  const res = await pool.query('SELECT slug FROM tenants WHERE id = $1', [ctx.tenantId])
  return res.rows[0]?.slug ?? null
}

export async function getPartner(ctx, partnerId) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `SELECT id, name, slug, supply_discount_pct FROM brands
        WHERE tenant_id = $1 AND id = $2 AND partner`,
      [ctx.tenantId, partnerId],
    )
    return res.rows[0] ? rowToPartner(res.rows[0]) : null
  })
}

/**
 * Adds a partner, after the café's own brands in display order — the first
 * brand is where reports credit anything they cannot place, and that must stay
 * one of the café's own counters.
 *
 * The slug is what the partner's sales carry in business_type, so it has to
 * be unique in the tenant and can never collide with 'cafe', 'burger' or
 * 'combined', which mean something else there.
 */
export async function createPartner(ctx, { name, supplyDiscountPct }) {
  return withTenant(ctx, async (client) => {
    const taken = await client.query('SELECT slug FROM brands WHERE tenant_id = $1', [ctx.tenantId])
    const used = new Set([...taken.rows.map((r) => r.slug), 'cafe', 'burger', 'combined', 'both'])
    const base = partnerSlug(name)
    let slug = base
    for (let n = 2; used.has(slug); n += 1) slug = `${base.slice(0, 36)}-${n}`

    const id = `br-${randomUUID().slice(0, 8)}`
    const res = await client.query(
      `INSERT INTO brands (id, tenant_id, name, slug, sort_order, partner, supply_discount_pct)
       VALUES ($1, $2::varchar, $3, $4,
               (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM brands WHERE tenant_id = $2::varchar),
               TRUE, $5)
       RETURNING id, name, slug, supply_discount_pct`,
      [id, ctx.tenantId, name, slug, supplyDiscountPct],
    )
    return rowToPartner(res.rows[0])
  })
}

/** Renames a partner or changes its discount. The slug stays: old sales carry it. */
export async function updatePartner(ctx, partnerId, { name, supplyDiscountPct }) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `UPDATE brands SET
         name                = COALESCE($3, name),
         supply_discount_pct = COALESCE($4, supply_discount_pct)
       WHERE tenant_id = $1 AND id = $2 AND partner
       RETURNING id, name, slug, supply_discount_pct`,
      [ctx.tenantId, partnerId, name ?? null, supplyDiscountPct ?? null],
    )
    return res.rows[0] ? rowToPartner(res.rows[0]) : null
  })
}

/**
 * Replaces a partner's whole price list. `rows` is [{ itemId, price, visible }];
 * an item left out is one the partner no longer sells.
 *
 * Item ids are checked against the café's menu in the same statement that
 * writes them, so a list naming an item that was deleted a moment ago is
 * refused rather than half-applied.
 */
export async function savePartnerPrices(ctx, partnerId, rows) {
  return withTenant(ctx, async (client) => {
    const ids = rows.map((r) => r.itemId)
    if (ids.length) {
      const found = await client.query(
        'SELECT id FROM menu_items WHERE tenant_id = $1 AND id = ANY($2::varchar[])',
        [ctx.tenantId, ids],
      )
      if (found.rowCount !== new Set(ids).size) return { error: 'One of those items is no longer on the menu. Reload and try again.' }
    }

    await client.query('DELETE FROM partner_prices WHERE tenant_id = $1 AND brand_id = $2', [ctx.tenantId, partnerId])
    for (const r of rows) {
      await client.query(
        `INSERT INTO partner_prices (brand_id, item_id, tenant_id, price, visible)
         VALUES ($1, $2, $3, $4, $5)`,
        [partnerId, r.itemId, ctx.tenantId, r.price, r.visible],
      )
    }
    return { saved: rows.length }
  })
}

/**
 * Validates a submitted price list. Returns { rows } or { error }.
 * Each entry needs an item id and a price of 0 or more; visible defaults on.
 */
export function parsePartnerPrices(raw) {
  if (!Array.isArray(raw)) return { error: 'prices[] is required.' }
  const seen = new Set()
  const rows = []
  for (const r of raw) {
    const itemId = typeof r?.itemId === 'string' ? r.itemId.trim() : ''
    const price = Number(r?.price)
    if (!itemId) return { error: 'Each price needs an item.' }
    if (!Number.isFinite(price) || price < 0) return { error: 'Each price must be a number of 0 or more.' }
    if (seen.has(itemId)) continue
    seen.add(itemId)
    rows.push({ itemId, price: Math.round(price * 100) / 100, visible: r?.visible !== false })
  }
  return { rows }
}

// ── Logins ──────────────────────────────────────────────────────────────────

/** Whether a partner login still exists and still belongs to a live partner. */
export async function partnerLoginIsLive(userId, tenantId, partnerId) {
  const res = await pool.query(
    `SELECT 1 FROM users u JOIN brands b ON b.id = u.brand_id AND b.partner
      WHERE u.id = $1 AND u.tenant_id = $2 AND u.brand_id = $3 AND u.role = 'partner'`,
    [userId, tenantId, partnerId],
  )
  return res.rowCount > 0
}

/** The accounts that sign in as this partner. */
export async function listPartnerLogins(ctx, partnerId) {
  const res = await pool.query(
    `SELECT id, email, display_name, created_at FROM users
      WHERE tenant_id = $1 AND brand_id = $2 AND role = 'partner' ORDER BY created_at`,
    [ctx.tenantId, partnerId],
  )
  return res.rows.map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.display_name ?? null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  }))
}

/**
 * Creates a login for a partner.
 *
 * Its role is 'partner', which requireTenant() refuses outright — so the
 * account cannot reach a single one of the café's own routes, and only the
 * partner routes, which check brand_id against the partner they serve, let it
 * in. That is a deny-by-default: a café route added next year is closed to it
 * without anybody having to remember.
 */
export async function createPartnerLogin(ctx, partnerId, input) {
  const email = normalizeEmail(input.email)
  if (!email || !email.includes('@')) return { error: 'Enter a valid email address.' }
  const password = String(input.password ?? '')
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }

  const dup = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (dup.rows.length) return { error: 'An account with this email already exists.' }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  const id = `usr-${randomUUID().slice(0, 8)}`
  const displayName = input.displayName ? String(input.displayName).trim().slice(0, 80) || null : null

  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `INSERT INTO users (id, email, password_hash, role, display_name, created_at, created_by, tenant_id, brand_id)
       VALUES ($1, $2, $3, 'partner', $4, NOW(), $5, $6, $7)
       RETURNING id, email, display_name, created_at`,
      [id, email, hash, displayName, input.createdBy ?? null, ctx.tenantId, partnerId],
    )
    await client.query(
      `INSERT INTO memberships (id, user_id, tenant_id, location_id, role)
       VALUES ($1, $2, $3, NULL, 'partner') ON CONFLICT DO NOTHING`,
      [`mem-${randomUUID().slice(0, 8)}`, id, ctx.tenantId],
    )
    const r = res.rows[0]
    return { login: { id: r.id, email: r.email, displayName: r.display_name ?? null } }
  })
}

/** Removes a partner login. Only ever a partner account of this partner. */
export async function deletePartnerLogin(ctx, partnerId, userId) {
  return withTenant(ctx, async (client) => {
    await client.query('DELETE FROM memberships WHERE user_id = $1 AND tenant_id = $2', [userId, ctx.tenantId])
    const res = await client.query(
      `DELETE FROM users WHERE id = $1 AND tenant_id = $2 AND brand_id = $3 AND role = 'partner'`,
      [userId, ctx.tenantId, partnerId],
    )
    return res.rowCount > 0
  })
}
