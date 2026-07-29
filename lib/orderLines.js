import { randomUUID } from 'crypto'
import { dealBusinessType, itemBusinessType } from './businessTypes'
import { priceLine } from './pricing.js'

function newLineId() {
  return `l-${randomUUID().slice(0, 8)}`
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
export function buildOrderLine(raw, menu, { allowArchived = false } = {}) {
  const { kind, refId, qty } = raw
  const quantity = Number(qty)
  if (!['item', 'deal'].includes(kind) || !refId || !Number.isFinite(quantity) || quantity < 1) {
    return { error: 'kind (item|deal), refId, qty>=1 required', status: 400 }
  }
  const asked = requestedDiscounts(raw)

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
