import { applyPricing, priceLine, repriceLine } from '@/lib/pricing.js'

export function newLineId() {
  return `l-${crypto.randomUUID().slice(0, 8)}`
}

export function lineFromMenuItem(item, qty, discounts = {}) {
  return applyPricing(
    {
      id: newLineId(),
      kind: 'item',
      refId: item.id,
      name: item.name,
      category: item.category,
      unitPrice: item.price,
      ...(item.size ? { size: item.size } : {}),
      ...(item.flavour ? { flavour: item.flavour } : {}),
    },
    priceLine({ unitPrice: item.price, qty, ...discounts }),
  )
}

export function lineFromDeal(deal, qty, discounts = {}) {
  return applyPricing(
    {
      id: newLineId(),
      kind: 'deal',
      refId: deal.id,
      name: deal.name,
      unitPrice: deal.price,
      dealIncludes: deal.includes ? deal.includes.map((x) => ({ ...x })) : [],
    },
    priceLine({ unitPrice: deal.price, qty, ...discounts }),
  )
}

export function cloneInvoiceLines(lines) {
  return lines.map((l) => JSON.parse(JSON.stringify(l)))
}

export function updateLineQty(lines, lineId, rawQty) {
  return lines.map((l) => (l.id === lineId ? repriceLine(l, { qty: rawQty }) : l))
}

/** `field` is 'unitDiscount' (per item) or 'lineDiscount' (whole row). */
export function updateLineDiscount(lines, lineId, field, rawValue) {
  return lines.map((l) => (l.id === lineId ? repriceLine(l, { [field]: rawValue }) : l))
}

export function removeLineById(lines, lineId) {
  return lines.filter((l) => l.id !== lineId)
}
