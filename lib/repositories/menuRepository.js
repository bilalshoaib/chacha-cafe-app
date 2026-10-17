import { randomUUID } from 'crypto'
import { pool, withTenant } from '../db.js'
import { rowToTaxRate } from './taxRepository.js'
import { parseNewOrderPayment } from '../newOrderPayment.js'
import { itemBusinessType } from '../businessTypes.js'

// ── Helpers kept for controllers that import them directly ──────────────────

export function normalizeCategory(input) {
  const s = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  return s.slice(0, 40) || 'other'
}

export function optionalTrimmedString(val, maxLen) {
  if (val == null || typeof val !== 'string') return undefined
  const s = val.trim().slice(0, maxLen)
  return s || undefined
}

/**
 * A menu item's description: plain text on one line, at most 300 characters.
 * Line breaks and runs of spaces fold to one space, since it is shown as a
 * sentence on a menu card. Blank gives undefined (no description).
 */
export function parseItemDescription(val) {
  if (typeof val !== 'string') return undefined
  return optionalTrimmedString(val.replace(/\s+/g, ' '), 300)
}

/**
 * Parses an optional cost price. Blank/absent means "not recorded" and stores
 * NULL — deliberately different from 0, which would claim the item is free and
 * report a 100% margin.
 *
 * Returns { value } (a number or null) or { error }.
 */
export function parseCostPrice(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return { value: null }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return { error: 'Cost price must be a number of 0 or more, or left blank.' }
  return { value: Math.round(n * 100) / 100 }
}

/**
 * Normalises a deal's includes[]. Each entry is { itemId, qty, unitPrice? },
 * where unitPrice is what one unit is worth *inside this deal* — blank means
 * "not priced individually" and stores NULL so reports fall back to splitting
 * by menu price.
 *
 * Returns { includes } or { error }.
 */
export function parseDealIncludes(raw, validItemIds) {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'non-empty includes[] required' }
  const out = []
  for (const row of raw) {
    const qty = Number(row?.qty)
    if (!row?.itemId || !Number.isFinite(qty) || qty < 1 || !validItemIds.has(row.itemId)) {
      return { error: 'Each include needs valid itemId and qty >= 1' }
    }
    const price = parseCostPrice(row.unitPrice)
    if (price.error) return { error: 'Each item price in a deal must be a number of 0 or more, or left blank.' }
    out.push({ itemId: String(row.itemId), qty: Math.floor(qty), unitPrice: price.value })
  }
  return { includes: out }
}

export function newItemId() {
  return `i-${randomUUID().slice(0, 8)}`
}

export function newDealId() {
  return `d-${randomUUID().slice(0, 8)}`
}

// ── Row → domain object mappers ─────────────────────────────────────────────

function rowToItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    businessType: row.business_type,
    price: Number(row.price),
    // null (not 0) when no cost has been recorded — "unknown" must stay
    // distinguishable from "costs nothing".
    costPrice: row.cost_price == null ? null : Number(row.cost_price),
    ...(row.size ? { size: row.size } : {}),
    ...(row.flavour ? { flavour: row.flavour } : {}),
    // For the public menus; see migrations/037_menu_item_description.sql.
    ...(row.description ? { description: row.description } : {}),
  }
}

function rowToDeal(row, includes = []) {
  const deal = {
    id: row.id,
    name: row.name,
    businessType: row.business_type,
    price: Number(row.price),
    status: row.status ?? 'active',
    includes,
  }
  if (row.business_type === 'combined') {
    deal.cafeSplit = Number(row.cafe_split ?? 0)
    deal.burgerSplit = Number(row.burger_split ?? 0)
  }
  return deal
}

function rowToPartner(row, prices = [], ownItems = []) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    supplyDiscountPct: Number(row.supply_discount_pct ?? 0),
    // What its receipts print in place of the café's tagline and footer.
    receiptTagline: row.receipt_tagline ?? null,
    receiptFooter: row.receipt_footer ?? null,
    prices,
    // Items it makes itself (migrations/035_partner_items.sql).
    ownItems,
  }
}

export function rowToPartnerItem(r) {
  return { id: r.id, name: r.name, category: r.category, price: Number(r.price), visible: r.visible }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function loadMenu(ctx) {
  return withTenant(ctx, async (client) => {
  // Every result set in one round trip.
  //
  // A single pg client runs its queries one after another — Promise.all over
  // the same client does not overlap them, it just queues them — so five
  // statements meant five waits on the network. Sent together they cost one,
  // which matters because this is the query behind every screen in the app.
  //
  // Categories and brands ride along rather than being fetched separately:
  // every screen that renders items also needs their labels and icons, and a
  // screen cannot decide whether to show a counter picker without knowing how
  // many counters exist.
  //
  // The tax configuration rides along for the same reason and a sharper one:
  // the till has to show the tax on the ticket *before* checkout, so a second
  // fetch would put a round trip between adding a line and seeing what the
  // customer owes. Two more result sets on a query already being made.
  //
  // The tenant id is inlined rather than bound because multiple statements
  // cannot carry parameters. withTenant has already checked its shape against
  // a character class with no quote and no backslash in it, and row level
  // security independently confines every one of these reads to this tenant.
  const t = ctx.tenantId
  const [itemsRes, dealsRes, includesRes, categoriesRes, brandsRes, taxRatesRes, taxSettingRes, partnerPricesRes, partnerItemsRes] =
    await client.query(
    `SELECT * FROM menu_items    WHERE tenant_id = '${t}' ORDER BY category, name;
     SELECT * FROM deals         WHERE tenant_id = '${t}' ORDER BY name;
     SELECT * FROM deal_includes WHERE tenant_id = '${t}' ORDER BY deal_id;
     SELECT key, label, icon, color FROM categories WHERE tenant_id = '${t}' ORDER BY sort_order, label;
     SELECT id, name, slug, partner, supply_discount_pct, receipt_tagline, receipt_footer
       FROM brands WHERE tenant_id = '${t}' ORDER BY sort_order, name;
     SELECT id, location_id, name, rate, order_types, categories, enabled, sort_order
       FROM tax_rates WHERE tenant_id = '${t}' ORDER BY sort_order, name;
     SELECT prices_include_tax, new_order_payment FROM tenants WHERE id = '${t}';
     SELECT brand_id, item_id, price, visible, display_name FROM partner_prices WHERE tenant_id = '${t}';
     SELECT id, brand_id, name, category, price, visible FROM partner_items WHERE tenant_id = '${t}' ORDER BY name`,
  )

  const includesByDeal = new Map()
  for (const inc of includesRes.rows) {
    if (!includesByDeal.has(inc.deal_id)) includesByDeal.set(inc.deal_id, [])
    includesByDeal.get(inc.deal_id).push({
      itemId: inc.item_id,
      qty: inc.qty,
      // null when the owner hasn't priced this item inside the deal.
      unitPrice: inc.unit_price == null ? null : Number(inc.unit_price),
    })
  }

  // Partner kitchens are brands too, but not counters: an item is never "for"
  // a partner, and nothing that asks which counter something belongs to should
  // be offered one. They travel separately, each with its own price list.
  const pricesByPartner = new Map()
  for (const r of partnerPricesRes.rows) {
    if (!pricesByPartner.has(r.brand_id)) pricesByPartner.set(r.brand_id, [])
    pricesByPartner.get(r.brand_id).push({ itemId: r.item_id, price: Number(r.price), visible: r.visible, displayName: r.display_name ?? null })
  }
  const ownByPartner = new Map()
  for (const r of partnerItemsRes.rows) {
    if (!ownByPartner.has(r.brand_id)) ownByPartner.set(r.brand_id, [])
    ownByPartner.get(r.brand_id).push(rowToPartnerItem(r))
  }

  return {
    items: itemsRes.rows.map(rowToItem),
    deals: dealsRes.rows.map((r) => rowToDeal(r, includesByDeal.get(r.id) ?? [])),
    categories: categoriesRes.rows,
    brands: brandsRes.rows.filter((b) => !b.partner).map(({ id, name, slug }) => ({ id, name, slug })),
    partners: brandsRes.rows.filter((b) => b.partner).map((b) => rowToPartner(b, pricesByPartner.get(b.id) ?? [], ownByPartner.get(b.id) ?? [])),
    tax: {
      pricesIncludeTax: taxSettingRes.rows[0]?.prices_include_tax ?? true,
      rates: taxRatesRes.rows.map(rowToTaxRate),
    },
    // Travels with the menu so the till has it offline too — see lib/newOrderPayment.js.
    checkout: {
      newOrderPayment: parseNewOrderPayment(taxSettingRes.rows[0]?.new_order_payment),
    },
  }
  })
}

/**
 * Sync the full menu back to Postgres.
 * Called by controllers after in-memory mutations (same pattern as saveMenu with JSON).
 */
export async function saveMenu(ctx, menu) {
  await withTenant(ctx, async (client) => {
    const tenantId = ctx.tenantId
    const itemIds = (menu.items ?? []).map((i) => i.id)
    const dealIds = (menu.deals ?? []).map((d) => d.id)

    // ── Items ──
    if (itemIds.length > 0) {
      for (const item of menu.items) {
        await client.query(
          `INSERT INTO menu_items (id, name, category, business_type, price, size, flavour, cost_price, description, tenant_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (id) DO UPDATE SET
             name          = EXCLUDED.name,
             category      = EXCLUDED.category,
             business_type = EXCLUDED.business_type,
             price         = EXCLUDED.price,
             size          = EXCLUDED.size,
             flavour       = EXCLUDED.flavour,
             cost_price    = EXCLUDED.cost_price,
             description   = EXCLUDED.description
           WHERE menu_items.tenant_id = EXCLUDED.tenant_id`,
          [
            item.id,
            item.name,
            item.category,
            item.businessType ?? 'cafe',
            item.price,
            item.size ?? null,
            item.flavour ?? null,
            item.costPrice ?? null,
            item.description ?? null,
            tenantId,
          ],
        )
      }
      // Scoped to the tenant. saveMenu is a whole-menu replace, so this clears
      // whatever the caller left out — and unscoped it would clear every other
      // café's menu along with it.
      await client.query(
        `DELETE FROM menu_items WHERE tenant_id = $2 AND id <> ALL($1::varchar[])`,
        [itemIds, tenantId],
      )
    } else {
      await client.query('DELETE FROM menu_items WHERE tenant_id = $1', [tenantId])
    }

    // ── Deals ──
    if (dealIds.length > 0) {
      for (const deal of menu.deals) {
        await client.query(
          `INSERT INTO deals (id, name, business_type, price, cafe_split, burger_split, status, tenant_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO UPDATE SET
             name          = EXCLUDED.name,
             business_type = EXCLUDED.business_type,
             price         = EXCLUDED.price,
             cafe_split    = EXCLUDED.cafe_split,
             burger_split  = EXCLUDED.burger_split,
             status        = EXCLUDED.status
           WHERE deals.tenant_id = EXCLUDED.tenant_id`,
          [deal.id, deal.name, deal.businessType ?? 'cafe', deal.price,
           deal.cafeSplit ?? 0, deal.burgerSplit ?? 0, deal.status ?? 'active', tenantId],
        )

        await client.query('DELETE FROM deal_includes WHERE deal_id = $1 AND tenant_id = $2', [deal.id, tenantId])
        for (const inc of deal.includes ?? []) {
          await client.query(
            'INSERT INTO deal_includes (deal_id, item_id, qty, unit_price, tenant_id) VALUES ($1,$2,$3,$4,$5)',
            [deal.id, inc.itemId, inc.qty, inc.unitPrice ?? null, tenantId],
          )
        }
      }
      await client.query(
        `DELETE FROM deals WHERE tenant_id = $2 AND id <> ALL($1::varchar[])`,
        [dealIds, tenantId],
      )
    } else {
      await client.query('DELETE FROM deal_includes WHERE tenant_id = $1', [tenantId])
      await client.query('DELETE FROM deals WHERE tenant_id = $1', [tenantId])
    }
  })
}

/** Set a deal's status to 'active' or 'archived' without a full menu reload. */
export async function setDealStatus(ctx, id, status) {
  return withTenant(ctx, async (client) => {
    const result = await client.query(
      'UPDATE deals SET status = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id',
      [status, id, ctx.tenantId],
    )
    return result.rowCount > 0
  })
}

/** The tenant's brands in display order. Reports render a column per brand. */
export async function listBrands(ctx) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      'SELECT id, name, slug, sort_order, partner FROM brands WHERE tenant_id = $1 ORDER BY sort_order, name',
      [ctx.tenantId],
    )
    return res.rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, sortOrder: r.sort_order, partner: r.partner }))
  })
}

/**
 * Each menu item's counter, by id — for reports placing partner sales made
 * before their lines named the counter that supplied them.
 */
export async function listItemBusinessTypes(ctx) {
  return withTenant(ctx, async (client) => {
    const res = await client.query('SELECT id, name, category, business_type FROM menu_items WHERE tenant_id = $1', [ctx.tenantId])
    return new Map(res.rows.map((r) => [r.id, itemBusinessType({ name: r.name, category: r.category, businessType: r.business_type })]))
  })
}

/** The tenant's menu categories, in the order the owner put them. */
export async function listCategories(ctx) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `SELECT key, label, icon, color, sort_order FROM categories
        WHERE tenant_id = $1 ORDER BY sort_order, label`,
      [ctx.tenantId],
    )
    return res.rows.map((r) => ({ key: r.key, label: r.label, icon: r.icon, color: r.color }))
  })
}
