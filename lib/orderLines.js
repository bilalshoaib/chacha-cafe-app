import { randomUUID } from 'crypto'
import { dealBusinessType, itemBusinessType } from './businessTypes'

function newLineId() {
  return `l-${randomUUID().slice(0, 8)}`
}

function parseDiscount(raw, maxValue) {
  const d = Number(raw)
  if (!Number.isFinite(d) || d <= 0) return 0
  return Math.round(Math.min(d, maxValue) * 100) / 100
}

/**
 * Resolves a client-submitted { kind, refId, qty, discount } reference into a
 * fully-priced order line, looking up the current item/deal in the menu so
 * pricing is always computed server-side and never trusted from the client.
 * Returns { line } on success or { error, status } on failure.
 */
export function buildOrderLine({ kind, refId, qty, discount }, menu) {
  const quantity = Number(qty)
  if (!['item', 'deal'].includes(kind) || !refId || !Number.isFinite(quantity) || quantity < 1) {
    return { error: 'kind (item|deal), refId, qty>=1 required', status: 400 }
  }

  if (kind === 'item') {
    const item = menu.items.find((i) => i.id === refId)
    if (!item) return { error: 'Menu item not found', status: 404 }
    const gross = Math.round(item.price * quantity * 100) / 100
    const discountAmt = parseDiscount(discount, gross)
    const lineBusinessType = itemBusinessType(item)
    const line = {
      id: newLineId(),
      kind: 'item',
      refId: item.id,
      name: item.name,
      category: item.category,
      qty: quantity,
      unitPrice: item.price,
      ...(discountAmt > 0 ? { discount: discountAmt } : {}),
      lineTotal: Math.round(Math.max(0, gross - discountAmt) * 100) / 100,
      lineBusinessType,
      ...(item.size ? { size: item.size } : {}),
      ...(item.flavour ? { flavour: item.flavour } : {}),
    }
    return { line }
  }

  const deal = menu.deals.find((d) => d.id === refId)
  if (!deal) return { error: 'Deal not found', status: 404 }
  if (deal.status === 'archived') {
    return { error: `"${deal.name}" has been archived and cannot be added to orders.`, status: 400 }
  }
  const dealType = dealBusinessType(deal, menu.items)
  const gross = Math.round(deal.price * quantity * 100) / 100
  const discountAmt = parseDiscount(discount, gross)
  const line = {
    id: newLineId(),
    kind: 'deal',
    refId: deal.id,
    name: deal.name,
    qty: quantity,
    unitPrice: deal.price,
    ...(discountAmt > 0 ? { discount: discountAmt } : {}),
    lineTotal: Math.round(Math.max(0, gross - discountAmt) * 100) / 100,
    dealIncludes: deal.includes,
    lineBusinessType: dealType,
    ...(dealType === 'combined' ? { isCombined: true, cafeSplit: deal.cafeSplit ?? 0, burgerSplit: deal.burgerSplit ?? 0 } : {}),
  }
  return { line }
}
