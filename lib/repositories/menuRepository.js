import { randomUUID } from 'crypto'
import { pool, withTransaction } from '../db.js'

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
    ...(row.size ? { size: row.size } : {}),
    ...(row.flavour ? { flavour: row.flavour } : {}),
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

// ── Public API ───────────────────────────────────────────────────────────────

export async function loadMenu() {
  const [itemsRes, dealsRes, includesRes] = await Promise.all([
    pool.query('SELECT * FROM menu_items ORDER BY category, name'),
    pool.query('SELECT * FROM deals ORDER BY name'),
    pool.query('SELECT * FROM deal_includes ORDER BY deal_id'),
  ])

  const includesByDeal = new Map()
  for (const inc of includesRes.rows) {
    if (!includesByDeal.has(inc.deal_id)) includesByDeal.set(inc.deal_id, [])
    includesByDeal.get(inc.deal_id).push({ itemId: inc.item_id, qty: inc.qty })
  }

  return {
    items: itemsRes.rows.map(rowToItem),
    deals: dealsRes.rows.map((r) => rowToDeal(r, includesByDeal.get(r.id) ?? [])),
  }
}

/**
 * Sync the full menu back to Postgres.
 * Called by controllers after in-memory mutations (same pattern as saveMenu with JSON).
 */
export async function saveMenu(menu) {
  await withTransaction(async (client) => {
    const itemIds = (menu.items ?? []).map((i) => i.id)
    const dealIds = (menu.deals ?? []).map((d) => d.id)

    // ── Items ──
    if (itemIds.length > 0) {
      for (const item of menu.items) {
        await client.query(
          `INSERT INTO menu_items (id, name, category, business_type, price, size, flavour)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO UPDATE SET
             name          = EXCLUDED.name,
             category      = EXCLUDED.category,
             business_type = EXCLUDED.business_type,
             price         = EXCLUDED.price,
             size          = EXCLUDED.size,
             flavour       = EXCLUDED.flavour`,
          [
            item.id,
            item.name,
            item.category,
            item.businessType ?? 'cafe',
            item.price,
            item.size ?? null,
            item.flavour ?? null,
          ],
        )
      }
      await client.query(
        `DELETE FROM menu_items WHERE id <> ALL($1::varchar[])`,
        [itemIds],
      )
    } else {
      await client.query('DELETE FROM menu_items')
    }

    // ── Deals ──
    if (dealIds.length > 0) {
      for (const deal of menu.deals) {
        await client.query(
          `INSERT INTO deals (id, name, business_type, price, cafe_split, burger_split, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO UPDATE SET
             name          = EXCLUDED.name,
             business_type = EXCLUDED.business_type,
             price         = EXCLUDED.price,
             cafe_split    = EXCLUDED.cafe_split,
             burger_split  = EXCLUDED.burger_split,
             status        = EXCLUDED.status`,
          [deal.id, deal.name, deal.businessType ?? 'cafe', deal.price,
           deal.cafeSplit ?? 0, deal.burgerSplit ?? 0, deal.status ?? 'active'],
        )

        await client.query('DELETE FROM deal_includes WHERE deal_id = $1', [deal.id])
        for (const inc of deal.includes ?? []) {
          await client.query(
            'INSERT INTO deal_includes (deal_id, item_id, qty) VALUES ($1,$2,$3)',
            [deal.id, inc.itemId, inc.qty],
          )
        }
      }
      await client.query(
        `DELETE FROM deals WHERE id <> ALL($1::varchar[])`,
        [dealIds],
      )
    } else {
      await client.query('DELETE FROM deal_includes')
      await client.query('DELETE FROM deals')
    }
  })
}

/** Set a deal's status to 'active' or 'archived' without a full menu reload. */
export async function setDealStatus(id, status) {
  const result = await pool.query(
    "UPDATE deals SET status = $1 WHERE id = $2 RETURNING id",
    [status, id],
  )
  return result.rowCount > 0
}
