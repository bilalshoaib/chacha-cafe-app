/**
 * The end-of-day close: what the till says it took, what is actually in the
 * drawer, and the difference between them.
 *
 * A manager asks about this before they ask about almost anything else,
 * because it is how a café notices money going missing. The report itself is
 * only arithmetic over the shift's invoices — the part that matters is the
 * *variance*, and a variance needs two numbers that were arrived at
 * independently: what the system expects, and what a person counted.
 *
 * Pure, like lib/tax.js next door and for the same reasons. It is run by the
 * route that closes a shift, by the screen that previews one before it is
 * closed, and by the tests; none of them want a database import with it.
 *
 * **Cash is the only line that can vary.** Card and online takings reconcile
 * against the processor's own statement, not against a drawer, so counting
 * them here would invent a discrepancy nobody can act on. Expected cash is
 * the float that started the day, plus what was taken in cash, less what was
 * refunded in cash and what was paid out of the drawer in cash.
 */
import { roundMoney } from './pricing.js'
import { netOfTax } from './tax.js'

/** How a sale was settled. `null` on an invoice nobody has marked yet. */
export const PAYMENT_METHODS = ['cash', 'online']

/**
 * A shift's takings, broken down the way somebody closing a till needs them.
 *
 * `invoices` is every invoice stamped with this shift date — returned ones
 * included, because a refund is a movement of money and leaving it out would
 * make the drawer disagree with the report by exactly the amount refunded.
 *
 * `expenses` are cash paid out of the drawer during the shift: a delivery
 * driver settled, a bag of ice bought. They come out of expected cash for the
 * same reason a refund does.
 *
 * `openingFloat` is what the drawer started with. It is not takings and is
 * never counted as revenue; it is here only so that expected cash is a figure
 * that can be compared against what is physically in the drawer at the end.
 */
export function buildZReport({
  shiftDate,
  invoices = [],
  expenses = [],
  openingFloat = 0,
  countedCash = null,
} = {}) {
  const float = money(openingFloat)

  // Sales, and what was given back. A returned invoice is counted in both
  // places — once as the sale it was, once as the refund that reversed it —
  // rather than being quietly dropped, so the report shows the day that
  // actually happened rather than a tidied version of it.
  let grossSales = 0, netSales = 0, taxCollected = 0
  let deliveryCharges = 0, discountsGiven = 0
  let saleCount = 0, refundCount = 0, refundTotal = 0
  let unpaidCount = 0, unpaidTotal = 0

  const byMethod = new Map(PAYMENT_METHODS.map((m) => [m, { count: 0, total: 0 }]))
  const taxByRate = new Map()

  for (const inv of invoices) {
    const total = money(inv?.total)
    const returned = Boolean(inv?.returned)

    saleCount += 1
    grossSales = roundMoney(grossSales + total)
    netSales = roundMoney(netSales + netOfTax(inv))
    taxCollected = roundMoney(taxCollected + money(inv?.taxTotal))
    deliveryCharges = roundMoney(deliveryCharges + money(inv?.deliveryCharge))
    discountsGiven = roundMoney(discountsGiven + discountOn(inv))

    for (const t of Array.isArray(inv?.taxLines) ? inv.taxLines : []) {
      const key = t?.id ?? t?.name
      if (!key) continue
      const seen = taxByRate.get(key) ?? { id: t.id ?? null, name: t.name ?? '', rate: Number(t.rate) || 0, amount: 0 }
      seen.amount = roundMoney(seen.amount + money(t.amount))
      taxByRate.set(key, seen)
    }

    if (returned) {
      refundCount += 1
      refundTotal = roundMoney(refundTotal + total)
    }

    const method = PAYMENT_METHODS.includes(inv?.paymentMethod) ? inv.paymentMethod : null
    if (!method) {
      // Not "cash by default". An invoice nobody marked is a sale whose money
      // is unaccounted for, and folding it into cash would make the drawer
      // look short by exactly that amount with no way to see why.
      unpaidCount += 1
      unpaidTotal = roundMoney(unpaidTotal + total)
      continue
    }
    const bucket = byMethod.get(method)
    bucket.count += 1
    bucket.total = roundMoney(bucket.total + total)
  }

  const cashPaidOut = roundMoney(
    expenses.reduce((s, e) => s + money(e?.amount), 0),
  )

  // Only cash refunds come out of the drawer. A card sale refunded goes back
  // to the card, so taking it off expected cash would show a shortfall that
  // was never in the drawer to begin with.
  const cashRefunds = roundMoney(
    invoices
      .filter((inv) => inv?.returned && inv?.paymentMethod === 'cash')
      .reduce((s, inv) => s + money(inv?.total), 0),
  )

  const cashTaken = byMethod.get('cash').total
  const expectedCash = roundMoney(float + cashTaken - cashRefunds - cashPaidOut)

  const counted = countedCash == null || countedCash === '' ? null : money(countedCash)
  // Positive is over, negative is short. Signed rather than absolute, because
  // a drawer that is repeatedly over is its own kind of problem — usually a
  // till being rung up wrong rather than anybody stealing.
  const variance = counted == null ? null : roundMoney(counted - expectedCash)

  return {
    shiftDate: shiftDate ?? null,
    saleCount,
    grossSales,
    netSales,
    taxCollected,
    taxByRate: [...taxByRate.values()].sort((a, b) => b.amount - a.amount),
    deliveryCharges,
    discountsGiven,
    refundCount,
    refundTotal,
    unpaidCount,
    unpaidTotal,
    byMethod: PAYMENT_METHODS.map((m) => ({ method: m, ...byMethod.get(m) })),
    openingFloat: float,
    cashTaken,
    cashRefunds,
    cashPaidOut,
    expectedCash,
    countedCash: counted,
    variance,
  }
}

/**
 * What was taken off the ticket, across every line.
 *
 * Read back off the stored lines rather than recomputed from the menu: a
 * discount given on a sale last Tuesday is a fact about that sale, and the
 * price the item carries today has nothing to say about it.
 */
function discountOn(inv) {
  const lines = Array.isArray(inv?.lines) ? inv.lines : []
  return roundMoney(lines.reduce((sum, l) => {
    const qty = Number(l?.qty) || 0
    const unit = money(l?.unitDiscount) * qty
    const row = money(l?.lineDiscount ?? l?.discount)
    return sum + unit + row
  }, 0))
}

function money(v) {
  const n = Number(v)
  return Number.isFinite(n) ? roundMoney(n) : 0
}

/**
 * Checks a close on the way in.
 *
 * The counted figure is the one number in this whole feature that a person
 * types, so it is the one that has to be refused rather than coerced: a blank
 * box quietly read as zero would record a drawer that was never counted as a
 * drawer that was empty, and file a variance to match.
 */
export function parseCloseInput(body = {}) {
  const counted = Number(body.countedCash)
  if (body.countedCash === undefined || body.countedCash === null || body.countedCash === '') {
    return { error: 'Count the drawer before closing the shift.' }
  }
  if (!Number.isFinite(counted) || counted < 0) {
    return { error: 'The counted cash must be an amount of 0 or more.' }
  }

  const rawFloat = body.openingFloat
  const float = rawFloat === undefined || rawFloat === null || rawFloat === '' ? 0 : Number(rawFloat)
  if (!Number.isFinite(float) || float < 0) {
    return { error: 'The opening float must be an amount of 0 or more.' }
  }

  const note = body.note == null ? '' : String(body.note).trim().slice(0, 300)

  return { value: { countedCash: roundMoney(counted), openingFloat: roundMoney(float), note } }
}
