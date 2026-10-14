/**
 * Partner kitchens: another business selling the café's items, through the
 * café's till, at prices of its own. See migrations/033_partner_brands.sql.
 *
 * Pure, like the rest of the pricing modules — the browser imports this too.
 *
 * Three prices are in play for every unit a partner sells, and the names below
 * keep them apart:
 *
 *   menu price    what the café itself charges for the item
 *   partner price what the partner charges its customer — the line's unitPrice
 *   supply price  what the café is owed for the unit: the menu price less the
 *                 partner's discount. Frozen onto the line at the sale, so a
 *                 later change to either the menu or the discount cannot move
 *                 what an old sale settles at.
 *
 * The cashier collects the partner price. The café keeps the supply price and
 * owes the partner the difference.
 *
 * A partner may also sell items of its own (`partner.ownItems`, migrations/
 * 035_partner_items.sql). The café supplies nothing for those, so their supply
 * price is 0 and every rupee of them is the partner's.
 */

import { roundMoney } from './pricing.js'

/** Parses a discount percentage. Returns { value } or { error }. */
export function parseSupplyDiscountPct(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return { value: 0 }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 100) return { error: 'The discount must be a percentage from 0 to 100.' }
  return { value: roundMoney(n) }
}

/** What the café is owed for one unit of an item whose menu price is `menuPrice`. */
export function supplyUnitPrice(menuPrice, discountPct) {
  const price = Number(menuPrice) || 0
  const pct = Math.min(100, Math.max(0, Number(discountPct) || 0))
  return roundMoney(price * (1 - pct / 100))
}

/** The partner with this id on the menu, or null. */
export function findPartner(menu, partnerId) {
  if (!partnerId) return null
  return (menu?.partners ?? []).find((p) => p.id === partnerId) ?? null
}

/**
 * The partner's own price for an item, or null when it does not sell it.
 *
 * A hidden item still has a price; `includeHidden` is for re-pricing an
 * invoice that already carries it, where hiding the item since is a rule about
 * new sales and not a reason to make an old one uneditable.
 */
export function partnerPriceFor(partner, itemId, { includeHidden = false } = {}) {
  const row = (partner?.prices ?? []).find((p) => p.itemId === itemId)
  if (!row) return null
  if (!row.visible && !includeHidden) return null
  return Number(row.price)
}

/**
 * One of the partner's own items, or null. A hidden one only with
 * `includeHidden`, for the same reason as partnerPriceFor().
 */
export function partnerOwnItem(partner, itemId, { includeHidden = false } = {}) {
  const item = (partner?.ownItems ?? []).find((i) => i.id === itemId)
  if (!item) return null
  if (!item.visible && !includeHidden) return null
  return item
}

/**
 * The items a partner sells right now — the café's at the partner's price,
 * and its own — each carrying the price its customer pays. What the partner's
 * till shows, and nothing else. Own items are marked `own: true`.
 */
export function partnerSellableItems(menu, partner) {
  if (!partner) return []
  const byId = new Map((menu?.items ?? []).map((i) => [i.id, i]))
  const out = []
  for (const row of partner.prices ?? []) {
    if (!row.visible) continue
    const item = byId.get(row.itemId)
    if (!item) continue
    out.push({ ...item, price: Number(row.price) })
  }
  for (const item of partner.ownItems ?? []) {
    if (!item.visible) continue
    out.push({ id: item.id, name: item.name, category: item.category, price: Number(item.price), own: true })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * How a partner's sales settle, from the invoices it made.
 *
 * Only what the partner sold counts: returned invoices are left out, delivery
 * charges stay with the café (it is the café's rider), and tax is not either
 * business's money. What is left is split into the café's share — the supply
 * price of every unit — and the partner's, which is everything else.
 *
 * Returns { invoiceCount, units, sales, cafeShare, payable, items[] }, where
 * `payable` is what the café owes the partner. It is negative when the partner
 * sold below the supply price, and then it is the partner who owes.
 */
export function partnerSettlement(invoices) {
  let invoiceCount = 0
  let units = 0
  let sales = 0
  let cafeShare = 0
  const byItem = new Map()

  for (const inv of invoices ?? []) {
    if (inv.returned) continue
    invoiceCount += 1
    const lines = Array.isArray(inv.lines) ? inv.lines : []
    const gross = lines.reduce((s, l) => s + (Number(l.lineTotal) || 0), 0)
    // Inclusive tax sits inside the line totals and has to come back out, in
    // proportion to each line, so it reaches neither side of the split.
    const tax = inv.taxInclusive ? Number(inv.taxTotal) || 0 : 0
    const netFactor = gross > 0 ? (gross - tax) / gross : 1

    for (const line of lines) {
      const qty = Number(line.qty) || 0
      const lineSales = roundMoney((Number(line.lineTotal) || 0) * netFactor)
      const lineShare = roundMoney(Number(line.supplyTotal) || 0)
      units += qty
      sales = roundMoney(sales + lineSales)
      cafeShare = roundMoney(cafeShare + lineShare)

      const key = line.refId ?? line.name
      const row = byItem.get(key) ?? { refId: line.refId ?? null, name: line.name, qty: 0, sales: 0, cafeShare: 0 }
      row.qty += qty
      row.sales = roundMoney(row.sales + lineSales)
      row.cafeShare = roundMoney(row.cafeShare + lineShare)
      byItem.set(key, row)
    }
  }

  const items = [...byItem.values()]
    .map((r) => ({ ...r, payable: roundMoney(r.sales - r.cafeShare) }))
    .sort((a, b) => b.qty - a.qty)

  return {
    invoiceCount,
    units,
    sales,
    cafeShare,
    payable: roundMoney(sales - cafeShare),
    items,
  }
}

/**
 * The café's share of partner sales, credited to the café's own counter that
 * supplied each item — what lets the Chacha Cafe and Chacha Burger reports show
 * what they earned through a partner kitchen.
 *
 * `brands` is the tenant's brands in display order; `itemTypeById` names the
 * counter of an item by id, for lines sold before they carried
 * `supplyBusinessType`. A shared item, or one naming no counter of this
 * tenant's, is credited to the first counter, as calcInvoiceSplits() does.
 *
 * Returns a Map from counter slug to { amount, invoiceCount }, with only the
 * counters that supplied something.
 */
export function partnerSupplyByBrand(invoices, brands, itemTypeById = new Map()) {
  const own = (brands ?? []).filter((b) => !b.partner).map((b) => b.slug)
  const out = new Map()
  if (!own.length) return out
  const known = new Set(own)
  for (const inv of invoices ?? []) {
    if (inv.returned) continue
    const touched = new Set()
    for (const line of Array.isArray(inv.lines) ? inv.lines : []) {
      const share = roundMoney(Number(line.supplyTotal) || 0)
      if (share === 0) continue
      const type = line.supplyBusinessType ?? itemTypeById.get(line.refId) ?? null
      const slug = known.has(type) ? type : own[0]
      const row = out.get(slug) ?? { amount: 0, invoiceCount: 0 }
      row.amount = roundMoney(row.amount + share)
      if (!touched.has(slug)) { row.invoiceCount += 1; touched.add(slug) }
      out.set(slug, row)
    }
  }
  return out
}
