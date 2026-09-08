/**
 * The table a sale was served to.
 *
 * One module, because four things have to agree on what a table number is:
 * /api/checkout, the invoice PATCH that fixes a mis-keyed one, the offline
 * till that builds the invoice itself, and the sync endpoint that checks what
 * the till built. A second implementation of "trim it and cut it to twenty"
 * that drifted from the column width would fail at the database, in the one
 * path — a queued offline sale — where the customer has already left with the
 * receipt.
 *
 * Free text on purpose: see migration 031. "12A", "Patio 3" and "Bar 2" are
 * all table numbers to the staff calling them out.
 */

/** Matches the column width in migration 031. */
export const MAX_TABLE_NUMBER = 20

/**
 * The stored form of a table number, or null if there isn't one.
 *
 * Inner whitespace is collapsed so "table  4" and "table 4" are the same
 * table, which matters because the invoice search compares the stored text.
 * Case is *not* folded — "Patio 3" should print as it was typed — so the
 * search lowercases both sides instead.
 */
export function normalizeTableNumber(raw) {
  if (raw == null) return null
  const trimmed = String(raw).replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed.slice(0, MAX_TABLE_NUMBER) : null
}

/**
 * The table number to store against a sale of this type.
 *
 * A delivery has no table, so one arriving on a delivery is dropped rather
 * than stored — the same rule delivery charges follow in reverse, and for the
 * same reason: a field left over from before the cashier changed the order
 * type is worse than no field at all. Takeaway keeps its table number, because
 * counter-service cafés hand out a number and run the food out to it.
 */
export function tableNumberForOrderType(raw, orderType) {
  return orderType === 'delivery' ? null : normalizeTableNumber(raw)
}
