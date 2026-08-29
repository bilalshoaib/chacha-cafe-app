import { randomUUID } from 'crypto'
import { withTenant } from '../db.js'
import { forgetTenantBranding } from '../tenantBranding.js'

/**
 * A café's tax configuration: the rates it charges, and whether its menu
 * prices already contain them.
 *
 * The rates are read on every checkout and on every load of the till, so the
 * read here is deliberately one statement over a small table — a café has two
 * or three of these, not two hundred. loadMenu() fetches the same rows in its
 * own multi-statement round trip for the screens that need them alongside the
 * menu; this module is the write path and the one-off read.
 */

export function rowToTaxRate(row) {
  return {
    id: row.id,
    locationId: row.location_id ?? null,
    name: row.name,
    // NUMERIC comes back from pg as a string, and a string percentage silently
    // becomes string concatenation the first time somebody adds two of them.
    rate: Number(row.rate),
    orderTypes: Array.isArray(row.order_types) ? row.order_types : [],
    categories: Array.isArray(row.categories) ? row.categories : [],
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order ?? 0),
  }
}

const SELECT_RATES =
  `SELECT id, location_id, name, rate, order_types, categories, enabled, sort_order
     FROM tax_rates WHERE tenant_id = $1 ORDER BY sort_order, name`

/** Every rate the café has, switched on or off. */
export async function listTaxRates(ctx) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(SELECT_RATES, [ctx.tenantId])
    return res.rows.map(rowToTaxRate)
  })
}

/**
 * The whole configuration in one answer: the rates and the inclusive/exclusive
 * setting, which are never useful apart — a rate means nothing until you know
 * which side of the price it sits on.
 */
export async function getTaxConfig(ctx) {
  return withTenant(ctx, async (client) => {
    // Two result sets, one round trip, and the tenant id inlined rather than
    // bound because multiple statements cannot carry parameters — the same
    // trade loadMenu() makes, and safe for the same reason: withTenant has
    // already checked the id against a character class containing no quote and
    // no backslash.
    const t = ctx.tenantId
    const [ratesRes, tenantRes] = await client.query(
      `SELECT id, location_id, name, rate, order_types, categories, enabled, sort_order
         FROM tax_rates WHERE tenant_id = '${t}' ORDER BY sort_order, name;
       SELECT prices_include_tax FROM tenants WHERE id = '${t}'`,
    )
    return {
      // A café whose tenant row has gone missing is not a café that should be
      // charging tax on top of its prices.
      pricesIncludeTax: tenantRes.rows[0]?.prices_include_tax ?? true,
      rates: ratesRes.rows.map(rowToTaxRate),
    }
  })
}

export async function createTaxRate(ctx, fields) {
  return withTenant(ctx, async (client) => {
    const id = `tax-${randomUUID().slice(0, 8)}`
    const res = await client.query(
      `INSERT INTO tax_rates (id, tenant_id, location_id, name, rate, order_types, categories, enabled, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, location_id, name, rate, order_types, categories, enabled, sort_order`,
      [
        id,
        ctx.tenantId,
        fields.locationId ?? null,
        fields.name,
        fields.rate,
        fields.orderTypes ?? [],
        fields.categories ?? [],
        fields.enabled ?? true,
        fields.sortOrder ?? 0,
      ],
    )
    return rowToTaxRate(res.rows[0])
  })
}

export async function getTaxRate(ctx, id) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `SELECT id, location_id, name, rate, order_types, categories, enabled, sort_order
         FROM tax_rates WHERE id = $1 AND tenant_id = $2`,
      [id, ctx.tenantId],
    )
    return res.rows[0] ? rowToTaxRate(res.rows[0]) : null
  })
}

/** Replaces every field of one rate. The caller has already merged and validated. */
export async function updateTaxRate(ctx, id, fields) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `UPDATE tax_rates
          SET name = $3, rate = $4, order_types = $5, categories = $6, enabled = $7, sort_order = $8
        WHERE id = $1 AND tenant_id = $2
        RETURNING id, location_id, name, rate, order_types, categories, enabled, sort_order`,
      [
        id, ctx.tenantId,
        fields.name, fields.rate,
        fields.orderTypes ?? [], fields.categories ?? [],
        fields.enabled ?? true, fields.sortOrder ?? 0,
      ],
    )
    return res.rows[0] ? rowToTaxRate(res.rows[0]) : null
  })
}

/**
 * Removes a rate outright.
 *
 * Safe in a way it would not be if invoices referenced this row: every sale
 * stores the rate it was charged, by value, on its own tax_lines. Deleting the
 * configuration changes what the next sale is charged and nothing about any
 * sale already made.
 */
export async function deleteTaxRate(ctx, id) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      'DELETE FROM tax_rates WHERE id = $1 AND tenant_id = $2',
      [id, ctx.tenantId],
    )
    return res.rowCount > 0
  })
}

/**
 * Whether the café's menu prices already include tax.
 *
 * Lives on the tenant row, which is on the branding road — so the cache that
 * road keeps has to be dropped, exactly as the currency and language writes do.
 * It is not itself branding and is not read from the branding cache today, but
 * the row it sits on is, and a write that leaves a stale row cached is the bug
 * this rule exists to prevent.
 */
export async function setPricesIncludeTax(ctx, value) {
  const next = Boolean(value)
  await withTenant(ctx, async (client) => {
    await client.query('UPDATE tenants SET prices_include_tax = $2 WHERE id = $1', [ctx.tenantId, next])
  })
  forgetTenantBranding(ctx.tenantId)
  return next
}
