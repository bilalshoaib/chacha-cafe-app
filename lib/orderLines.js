import { dealBusinessType, itemBusinessType } from './businessTypes.js'
import { priceLine, roundMoney } from './pricing.js'
import { partnerPriceFor, supplyUnitPrice } from './partners.js'

// The global rather than node's `crypto` module, so the till can run this
// file too: a sale rung up on the device is priced by exactly the code that
// prices one at /api/checkout, lines' brands included.
// randomUUID is missing outside a secure context, which a till opened on a
// LAN address over plain http is; a line id only has to be unique within
// its own invoice.
function newLineId() {
  const c = globalThis.crypto
  const id = typeof c?.randomUUID === 'function' ? c.randomUUID() : Math.random().toString(16).slice(2)
  return `l-${id.slice(0, 8)}`
}

/**
 * The request may send a per-unit discount, a row discount, or the legacy
 * single `discount` field (which always meant a row discount).
 */
function requestedDiscounts({ discount, unitDiscount, lineDiscount }) {
  return {
    unitDiscount: unitDiscount ?? 0,
    lineDiscount: lineDiscount ?? discount ?? 0,
  }
}

/**
 * Resolves a client-submitted { kind, refId, qty, discount } reference into a
 * fully-priced order line, looking up the current item/deal in the menu so
 * pricing is always computed server-side and never trusted from the client.
 * Returns { line } on success or { error, status } on failure.
 *
 * `allowArchived` is for editing an invoice that already contains the deal:
 * archiving is a rule about starting new sales, and applying it retroactively
 * would leave old invoices permanently uneditable.
 */
export function buildOrderLine(raw, menu, { allowArchived = false, partner = null } = {}) {
  const { kind, refId, qty } = raw
  const quantity = Number(qty)
  if (!['item', 'deal'].includes(kind) || !refId || !Number.isFinite(quantity) || quantity < 1) {
    return { error: 'kind (item|deal), refId, qty>=1 required', status: 400 }
  }
  const asked = requestedDiscounts(raw)

  if (partner) return buildPartnerLine(raw, quantity, asked, menu, partner, { allowArchived })

  if (kind === 'item') {
    const item = menu.items.find((i) => i.id === refId)
    if (!item) return { error: 'Menu item not found', status: 404 }
    const priced = priceLine({ unitPrice: item.price, qty: quantity, ...asked })
    const line = {
      id: newLineId(),
      kind: 'item',
      refId: item.id,
      name: item.name,
      category: item.category,
      qty: priced.qty,
      unitPrice: item.price,
      ...(priced.unitDiscount > 0 ? { unitDiscount: priced.unitDiscount } : {}),
      ...(priced.lineDiscount > 0 ? { lineDiscount: priced.lineDiscount } : {}),
      ...(priced.discount > 0 ? { discount: priced.discount } : {}),
      lineTotal: priced.lineTotal,
      lineBusinessType: itemBusinessType(item),
      ...(item.size ? { size: item.size } : {}),
      ...(item.flavour ? { flavour: item.flavour } : {}),
    }
    return { line }
  }

  const deal = menu.deals.find((d) => d.id === refId)
  if (!deal) return { error: 'Deal not found', status: 404 }
  if (deal.status === 'archived' && !allowArchived) {
    return { error: `"${deal.name}" has been archived and cannot be added to orders.`, status: 400 }
  }
  const dealType = dealBusinessType(deal, menu.items)
  const priced = priceLine({ unitPrice: deal.price, qty: quantity, ...asked })
  const line = {
    id: newLineId(),
    kind: 'deal',
    refId: deal.id,
    name: deal.name,
    qty: priced.qty,
    unitPrice: deal.price,
    ...(priced.unitDiscount > 0 ? { unitDiscount: priced.unitDiscount } : {}),
    ...(priced.lineDiscount > 0 ? { lineDiscount: priced.lineDiscount } : {}),
    ...(priced.discount > 0 ? { discount: priced.discount } : {}),
    lineTotal: priced.lineTotal,
    dealIncludes: deal.includes,
    lineBusinessType: dealType,
    ...(dealType === 'combined' ? { isCombined: true, cafeSplit: deal.cafeSplit ?? 0, burgerSplit: deal.burgerSplit ?? 0 } : {}),
  }
  return { line }
}

/**
 * A line sold for a partner kitchen (lib/partners.js): priced from the
 * partner's own list rather than the café's, and carrying what the café is owed
 * for it.
 *
 * Items only. A deal is the café's bundle at the café's price, and a partner
 * that wants one sets up its own price for the items instead.
 *
 * The supply price is taken on the full quantity and ignores any discount the
 * cashier gives: the partner chose to give it, and the café supplied the food
 * all the same.
 */
function buildPartnerLine(raw, quantity, asked, menu, partner, { allowArchived }) {
  if (raw.kind !== 'item') return { error: `${partner.name} sells items only, not deals.`, status: 400 }
  const item = menu.items.find((i) => i.id === raw.refId)
  if (!item) return { error: 'Menu item not found', status: 404 }
  const price = partnerPriceFor(partner, item.id, { includeHidden: allowArchived })
  if (price == null) return { error: `"${item.name}" is not on ${partner.name}'s menu.`, status: 400 }

  const priced = priceLine({ unitPrice: price, qty: quantity, ...asked })
  const supplyUnit = supplyUnitPrice(item.price, partner.supplyDiscountPct)
  const line = {
    id: newLineId(),
    kind: 'item',
    refId: item.id,
    name: item.name,
    category: item.category,
    qty: priced.qty,
    unitPrice: price,
    ...(priced.unitDiscount > 0 ? { unitDiscount: priced.unitDiscount } : {}),
    ...(priced.lineDiscount > 0 ? { lineDiscount: priced.lineDiscount } : {}),
    ...(priced.discount > 0 ? { discount: priced.discount } : {}),
    lineTotal: priced.lineTotal,
    lineBusinessType: partner.slug,
    supplyUnitPrice: supplyUnit,
    supplyTotal: roundMoney(supplyUnit * priced.qty),
    ...(item.size ? { size: item.size } : {}),
    ...(item.flavour ? { flavour: item.flavour } : {}),
  }
  return { line }
}
