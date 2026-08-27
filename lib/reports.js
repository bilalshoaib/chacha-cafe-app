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

/**
 * Attributes an invoice's money to the brands it came from.
 *
 * Replaces a function that returned { cafePortion, burgerPortion } — a shape
 * that could only ever describe Chacha, and that a café with one counter or
 * three had no way to be represented in.
 *
 * `brands` is the tenant's own brands, in display order. Returns a Map from
 * brand slug to amount, with an entry for every brand so a caller can render
 * a column per brand without checking for gaps.
 *
 * Lines carry their brand as a slug in `lineBusinessType`, which is what
 * business_type has always held — 'cafe' and 'burger' were brand slugs before
 * brands existed. Three cases:
 *
 *   • a combined deal with explicit per-brand splits, honoured as given
 *   • a line naming a brand, credited to it
 *   • a shared line, or one naming a brand this tenant does not have,
 *     credited to the first brand — for a single-brand café that is simply
 *     "the café", and for Chacha it preserves the old rule where shared items
 *     counted towards the cafe
 */
export function calcInvoiceSplits(inv, brands) {
  const list = Array.isArray(brands) && brands.length ? brands : [{ slug: 'cafe' }]
  const byBrand = new Map(list.map((b) => [b.slug, 0]))
  const fallback = list[0].slug
  const credit = (slug, amount) => {
    const key = byBrand.has(slug) ? slug : fallback
    byBrand.set(key, roundMoney(byBrand.get(key) + amount))
  }

  const lines = Array.isArray(inv.lines) ? inv.lines : []
  for (const line of lines) {
    const lineTotal = roundMoney(line.lineTotal ?? 0)
    const splits = brandSplitsOf(line, list)

    if (splits) {
      // A discount on a combined deal is not tied to either side, so it is
      // shared evenly across the brands the deal spans.
      const discount = roundMoney(line.discount ?? 0)
      const share = roundMoney(discount / splits.length)
      let taken = 0
      splits.forEach(({ slug, amount }, i) => {
        const last = i === splits.length - 1
        const off = last ? roundMoney(discount - taken) : share
        taken = roundMoney(taken + off)
        credit(slug, roundMoney(amount - off))
      })
      continue
    }

    if (line.lineBusinessType) {
      credit(line.lineBusinessType, lineTotal)
    } else {
      // Lines predating lineBusinessType fall back to the invoice's own brand.
      credit(invoiceBusinessType(inv), lineTotal)
    }
  }

  if (lines.length === 0) credit(invoiceBusinessType(inv), roundMoney(inv.total ?? 0))
  return byBrand
}

/**
 * The per-brand amounts of a combined deal line, or null when the line is not
 * one.
 *
 * Reads `brandSplits` — a slug-keyed object — and falls back to the
 * cafeSplit/burgerSplit pair that lines written before brands carry. Those
 * live inside the invoice's JSONB and cannot be migrated in place, so they are
 * read where they are rather than rewritten.
 */
function brandSplitsOf(line, brands) {
  if (!line?.isCombined) return null
  const qty = Number(line.qty) || 1

  if (line.brandSplits && typeof line.brandSplits === 'object') {
    const out = Object.entries(line.brandSplits)
      .map(([slug, amount]) => ({ slug, amount: roundMoney(Number(amount) * qty) }))
      .filter((x) => Number.isFinite(x.amount))
    if (out.length && out.some((x) => x.amount > 0)) return out
  }

  const legacy = [
    { slug: 'cafe', amount: roundMoney((line.cafeSplit ?? 0) * qty) },
    { slug: 'burger', amount: roundMoney((line.burgerSplit ?? 0) * qty) },
  ].filter((x) => brands.some((b) => b.slug === x.slug))
  if (legacy.length && legacy.reduce((s, x) => s + x.amount, 0) > 0) return legacy

  return null
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
