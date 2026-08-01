import { normalizeBusinessType } from './businessTypes.js'

export function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100
}

export function invoiceBusinessType(inv) {
  if (inv?.businessType === 'combined') return 'combined'
  const explicit = normalizeBusinessType(inv?.businessType)
  if (explicit) return explicit
  if (String(inv?.id ?? '').startsWith('inv-burger-')) return 'burger'
  if (String(inv?.id ?? '').startsWith('inv-combined-')) return 'combined'
  return 'cafe'
}

/** Splits an invoice's money between the two businesses for reporting. */
export function calcInvoiceSplits(inv, invBt) {
  const lines = Array.isArray(inv.lines) ? inv.lines : []
  let cafeAmt = 0
  let burgerAmt = 0
  for (const line of lines) {
    const lt = roundMoney(line.lineTotal ?? 0)
    // Combined deal with explicit per-item splits (existing mechanism)
    const lineCafe = roundMoney((line.cafeSplit ?? 0) * (line.qty ?? 1))
    const lineBurger = roundMoney((line.burgerSplit ?? 0) * (line.qty ?? 1))
    const splitsValid = line.isCombined && (lineCafe + lineBurger) > 0
    if (splitsValid) {
      // Discounts on a combined deal aren't tied to either side, so split them 50/50.
      const discount = roundMoney(line.discount ?? 0)
      const cafeDiscount = roundMoney(discount / 2)
      const burgerDiscount = roundMoney(discount - cafeDiscount)
      cafeAmt += lineCafe - cafeDiscount
      burgerAmt += lineBurger - burgerDiscount
    } else if (line.lineBusinessType) {
      // Per-line attribution for combined orders (and back-filled on old single-business orders)
      if (line.lineBusinessType === 'burger') {
        burgerAmt += lt
      } else {
        // 'cafe' and 'both' (shared items) are attributed to Chacha Cafe
        cafeAmt += lt
      }
    } else {
      // Legacy lines without lineBusinessType: fall back to invoice-level businessType
      if (invBt === 'burger') burgerAmt += lt
      else cafeAmt += lt
    }
  }
  if (lines.length === 0) {
    if (invBt === 'burger') burgerAmt = roundMoney(inv.total ?? 0)
    else cafeAmt = roundMoney(inv.total ?? 0)
  }
  return { cafePortion: roundMoney(cafeAmt), burgerPortion: roundMoney(burgerAmt) }
}

/**
 * Splits a deal line's actual revenue across the items bundled inside it.
 *
 * Each item's share is proportional to its weight in the bundle, where weight
 * is preferably the price the owner set for that item *inside this deal*
 * (deal_includes.unit_price) and otherwise its menu price.
 *
 * The share is always taken from the line's *actual* revenue, not from the
 * stated prices directly, because a line can be discounted at the till and a
 * deal's stated prices need not add up to its bundle price. When they do add
 * up and nothing is discounted, each item receives exactly its stated amount.
 * Either way the shares reconcile to the line total.
 *
 * `priceById` maps a menu item id to its current price. Items with neither a
 * stated nor a menu price fall back to an even split per unit.
 *
 * Returns [{ itemId, units, revenue }].
 */
export function allocateDealLineRevenue(line, priceById) {
  const includes = Array.isArray(line?.dealIncludes) ? line.dealIncludes : []
  const lineQty = Number(line?.qty) || 0
  const lineTotal = roundMoney(line?.lineTotal ?? 0)

  const parts = []
  for (const inc of includes) {
    const units = (Number(inc?.qty) || 0) * lineQty
    if (units <= 0) continue
    // The owner's stated in-deal price wins over the menu price. Guard the
    // null/blank cases explicitly: Number(null) and Number('') are both 0,
    // which would silently value an unpriced item at nothing.
    const raw = inc?.unitPrice
    const stated = raw == null || raw === '' ? NaN : Number(raw)
    const unitWorth = Number.isFinite(stated) && stated >= 0 ? stated : (priceById.get(inc.itemId) ?? 0)
    parts.push({ itemId: inc.itemId, units, weight: roundMoney(unitWorth * units) })
  }
  if (parts.length === 0) return []

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0)
  const totalUnits = parts.reduce((s, p) => s + p.units, 0)

  let allocated = 0
  for (const p of parts) {
    const fraction = totalWeight > 0 ? p.weight / totalWeight : p.units / totalUnits
    p.revenue = roundMoney(lineTotal * fraction)
    allocated = roundMoney(allocated + p.revenue)
  }

  // Rounding can leave a paisa or two unassigned; give it to the largest share
  // so the parts reconcile exactly with the line total.
  const drift = roundMoney(lineTotal - allocated)
  if (drift !== 0) {
    const biggest = parts.reduce((a, b) => (b.revenue > a.revenue ? b : a), parts[0])
    biggest.revenue = roundMoney(biggest.revenue + drift)
  }

  return parts.map(({ itemId, units, revenue }) => ({ itemId, units, revenue }))
}

/**
 * Validates the from/to query params shared by every report endpoint.
 * Returns { from, to } as Dates, or { error, status } for the caller to return.
 */
export function parseReportRange(searchParams) {
  const fromRaw = searchParams.get('from')
  const toRaw = searchParams.get('to')
  if (!fromRaw || !toRaw) return { error: 'Query params from and to are required.', status: 400 }
  const from = new Date(fromRaw)
  const to = new Date(toRaw)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { error: 'Invalid from or to date.', status: 400 }
  if (from.getTime() > to.getTime()) return { error: 'from must be before or equal to to.', status: 400 }
  return { from, to }
}

/** Business/payment filters, shared so every tab narrows its data the same way. */
export function parseReportFilters(searchParams) {
  const business = normalizeBusinessType(searchParams.get('businessType'))
  const paymentRaw = searchParams.get('paymentMethod')
  const payment = paymentRaw === 'cash' || paymentRaw === 'online' ? paymentRaw : null
  return { business, payment }
}

export function matchesBusiness(businessType, filter) {
  if (!filter) return true
  // Combined invoices hold items from both businesses — show them in either filter.
  return businessType === filter || businessType === 'combined'
}

export function matchesPayment(paymentMethod, filter) {
  if (!filter) return true
  return paymentMethod === filter
}
