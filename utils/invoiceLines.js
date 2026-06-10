export function newLineId() {
  return `l-${crypto.randomUUID().slice(0, 8)}`
}

export function lineFromMenuItem(item, qty) {
  const q = Math.max(1, Math.floor(Number(qty)) || 1)
  const unitPrice = item.price
  const lineTotal = Math.round(unitPrice * q * 100) / 100
  return {
    id: newLineId(),
    kind: 'item',
    refId: item.id,
    name: item.name,
    category: item.category,
    qty: q,
    unitPrice,
    lineTotal,
    ...(item.size ? { size: item.size } : {}),
    ...(item.flavour ? { flavour: item.flavour } : {}),
  }
}

export function lineFromDeal(deal, qty) {
  const q = Math.max(1, Math.floor(Number(qty)) || 1)
  const unitPrice = deal.price
  const lineTotal = Math.round(unitPrice * q * 100) / 100
  return {
    id: newLineId(),
    kind: 'deal',
    refId: deal.id,
    name: deal.name,
    qty: q,
    unitPrice,
    lineTotal,
    dealIncludes: deal.includes ? deal.includes.map((x) => ({ ...x })) : [],
  }
}

export function cloneInvoiceLines(lines) {
  return lines.map((l) => JSON.parse(JSON.stringify(l)))
}

export function updateLineQty(lines, lineId, rawQty) {
  const q = Math.max(1, Math.floor(Number(rawQty)) || 1)
  return lines.map((l) => {
    if (l.id !== lineId) return l
    const lineTotal = Math.round(l.unitPrice * q * 100) / 100
    return { ...l, qty: q, lineTotal }
  })
}

export function removeLineById(lines, lineId) {
  return lines.filter((l) => l.id !== lineId)
}
