export function newLineId() {
  return `l-${crypto.randomUUID().slice(0, 8)}`
}

function normalizeQty(qty) {
  return Math.max(1, Math.floor(Number(qty)) || 1)
}

/** A discount can never exceed the line's gross, mirroring the server's rule. */
function clampDiscount(raw, gross) {
  const d = Number(raw)
  if (!Number.isFinite(d) || d <= 0) return 0
  return Math.round(Math.min(d, gross) * 100) / 100
}

/** Recomputes lineTotal from qty and discount together — editing one must never
 *  silently drop the other. */
function repriceLine(line, { qty = line.qty, discount = line.discount ?? 0 }) {
  const q = normalizeQty(qty)
  const gross = Math.round(line.unitPrice * q * 100) / 100
  const discountAmt = clampDiscount(discount, gross)
  const next = {
    ...line,
    qty: q,
    lineTotal: Math.round(Math.max(0, gross - discountAmt) * 100) / 100,
  }
  if (discountAmt > 0) next.discount = discountAmt
  else delete next.discount
  return next
}

export function lineFromMenuItem(item, qty, discount = 0) {
  const q = normalizeQty(qty)
  const gross = Math.round(item.price * q * 100) / 100
  const discountAmt = clampDiscount(discount, gross)
  return {
    id: newLineId(),
    kind: 'item',
    refId: item.id,
    name: item.name,
    category: item.category,
    qty: q,
    unitPrice: item.price,
    ...(discountAmt > 0 ? { discount: discountAmt } : {}),
    lineTotal: Math.round(Math.max(0, gross - discountAmt) * 100) / 100,
    ...(item.size ? { size: item.size } : {}),
    ...(item.flavour ? { flavour: item.flavour } : {}),
  }
}

export function lineFromDeal(deal, qty, discount = 0) {
  const q = normalizeQty(qty)
  const gross = Math.round(deal.price * q * 100) / 100
  const discountAmt = clampDiscount(discount, gross)
  return {
    id: newLineId(),
    kind: 'deal',
    refId: deal.id,
    name: deal.name,
    qty: q,
    unitPrice: deal.price,
    ...(discountAmt > 0 ? { discount: discountAmt } : {}),
    lineTotal: Math.round(Math.max(0, gross - discountAmt) * 100) / 100,
    dealIncludes: deal.includes ? deal.includes.map((x) => ({ ...x })) : [],
  }
}

export function cloneInvoiceLines(lines) {
  return lines.map((l) => JSON.parse(JSON.stringify(l)))
}

export function updateLineQty(lines, lineId, rawQty) {
  return lines.map((l) => (l.id === lineId ? repriceLine(l, { qty: rawQty }) : l))
}

export function updateLineDiscount(lines, lineId, rawDiscount) {
  return lines.map((l) => (l.id === lineId ? repriceLine(l, { discount: rawDiscount }) : l))
}

export function removeLineById(lines, lineId) {
  return lines.filter((l) => l.id !== lineId)
}
