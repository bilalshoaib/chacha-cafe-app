/** Money rounding used everywhere a line total is computed. */
export function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100
}

function clampPositive(raw, max) {
  const d = Number(raw)
  if (!Number.isFinite(d) || d <= 0) return 0
  return roundMoney(Math.min(d, Math.max(0, max)))
}

/**
 * A line can carry two discounts at once:
 *   unitDiscount — taken off every unit, so it scales with qty
 *   lineDiscount — taken off the row as a whole, once
 *
 * `discount` is their sum, and stays the single money figure that receipts,
 * reports and the cafe/burger invoice split read — so nothing downstream has
 * to know the difference.
 */
export function priceLine({ unitPrice, qty, unitDiscount = 0, lineDiscount = 0 }) {
  const price = Number(unitPrice) || 0
  const q = Math.max(1, Math.floor(Number(qty)) || 1)
  const gross = roundMoney(price * q)

  // A per-unit discount can never exceed the unit's own price.
  const perUnit = clampPositive(unitDiscount, price)
  const unitPart = roundMoney(perUnit * q)

  // Whatever survives the per-unit cut is the most the row discount can take.
  const lineLevel = clampPositive(lineDiscount, roundMoney(gross - unitPart))

  const discount = roundMoney(unitPart + lineLevel)
  return {
    qty: q,
    unitDiscount: perUnit,
    lineDiscount: lineLevel,
    discount,
    lineTotal: roundMoney(Math.max(0, gross - discount)),
  }
}

/**
 * Splits a stored line back into its two discount inputs. Lines saved before
 * per-unit discounts existed carry only `discount`, which was always a
 * row-level amount.
 */
export function discountPartsOf(line) {
  const unitDiscount = Number(line?.unitDiscount) || 0
  if (line?.lineDiscount != null) {
    return { unitDiscount, lineDiscount: Number(line.lineDiscount) || 0 }
  }
  const total = Number(line?.discount) || 0
  const qty = Math.max(1, Math.floor(Number(line?.qty)) || 1)
  return { unitDiscount, lineDiscount: roundMoney(Math.max(0, total - unitDiscount * qty)) }
}

/** Writes priced values onto a line, dropping the keys that came out zero. */
export function applyPricing(line, priced) {
  const next = { ...line, qty: priced.qty, lineTotal: priced.lineTotal }
  if (priced.unitDiscount > 0) next.unitDiscount = priced.unitDiscount
  else delete next.unitDiscount
  if (priced.lineDiscount > 0) next.lineDiscount = priced.lineDiscount
  else delete next.lineDiscount
  if (priced.discount > 0) next.discount = priced.discount
  else delete next.discount
  return next
}

/** Re-prices a line after one of qty / unitDiscount / lineDiscount changes. */
export function repriceLine(line, changes = {}) {
  const parts = discountPartsOf(line)
  return applyPricing(
    line,
    priceLine({
      unitPrice: line.unitPrice,
      qty: changes.qty ?? line.qty,
      unitDiscount: changes.unitDiscount ?? parts.unitDiscount,
      lineDiscount: changes.lineDiscount ?? parts.lineDiscount,
    }),
  )
}
