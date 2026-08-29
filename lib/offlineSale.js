/**
 * A sale rung up while the till could not reach the server.
 *
 * The awkward part of selling offline is not storing the sale — it is that
 * /api/checkout is the thing that decides what the customer owes, and it is
 * exactly what is unreachable. So the till decides instead, using the same
 * pure modules the server runs (lib/pricing.js, lib/tax.js) over the menu and
 * rates it cached while it was still connected. The figures are therefore
 * arrived at by the same code, not by a second implementation of it that can
 * drift.
 *
 * What the till cannot do is mint an invoice number, so it spends one from a
 * block reserved in advance (see app/api/checkout/reserve/route.js). By the
 * time a queued sale reaches the server it is already complete and already
 * printed, and syncing it is an insert rather than a checkout.
 *
 * Both halves live here, and both are pure, so the arithmetic a receipt was
 * printed from is the arithmetic the server checks it against.
 */
import { priceLine, roundMoney } from './pricing.js'
import { computeInvoiceTax, invoiceTotal } from './tax.js'
import { invoiceBusinessTypeForLines } from './businessTypes.js'
import { shiftDateForInstant } from './shift.js'

export const VALID_ORDER_TYPES = ['takeaway', 'dine_in', 'delivery']
export const VALID_PAYMENT_METHODS = ['cash', 'online']

/** Money figures are compared to the cent; anything closer is rounding noise. */
const CENT = 0.005

/**
 * Assembles the invoice an offline sale becomes, from the cart the till is
 * holding and one number out of its reserved block.
 *
 * `reservation` is `{ invoiceNumber, shiftNumber, shiftDate }`. The shift date
 * is the one the block was reserved against; if the café's trading day has
 * rolled over since — a till still selling at 3am on a block taken at 9pm —
 * the reserved order number belongs to a shift that has ended, so the sale
 * takes none and the server assigns one at sync. An invoice with no order
 * number already renders correctly everywhere; two customers holding order #7
 * does not.
 */
export function buildOfflineInvoice({
  lines = [],
  reservation,
  rates = [],
  pricesIncludeTax = true,
  orderType = null,
  deliveryCharge = 0,
  customerNote = '',
  paymentMethod = null,
  dayStartHour,
  now = new Date(),
}) {
  if (!reservation || !Number.isFinite(Number(reservation.invoiceNumber))) {
    throw new Error('An offline sale needs a reserved invoice number.')
  }
  if (!Array.isArray(lines) || !lines.length) {
    throw new Error('Add at least one line before checkout')
  }

  const type = VALID_ORDER_TYPES.includes(orderType) ? orderType : null
  const rawDelivery = Number(deliveryCharge)
  const delivery = type === 'delivery' && Number.isFinite(rawDelivery) && rawDelivery > 0
    ? roundMoney(rawDelivery)
    : 0

  const subtotal = roundMoney(lines.reduce((s, l) => s + (Number(l.lineTotal) || 0), 0))
  const tax = computeInvoiceTax({ lines, rates, orderType: type, pricesIncludeTax })
  const total = invoiceTotal({ subtotal, deliveryCharge: delivery, taxTotal: tax.taxTotal, inclusive: tax.inclusive })

  const createdAt = now instanceof Date ? now : new Date(now)
  const localShiftDate = Number.isFinite(Number(dayStartHour))
    ? shiftDateForInstant(createdAt, { shiftStartHour: Number(dayStartHour) })
    : reservation.shiftDate
  const sameShift = localShiftDate === reservation.shiftDate

  return {
    id: `inv-${Number(reservation.invoiceNumber)}`,
    businessType: invoiceBusinessTypeForLines(lines),
    orderId: null,
    createdAt: createdAt.toISOString(),
    customerNote: customerNote ? String(customerNote).slice(0, 200) : '',
    lines,
    subtotal,
    total,
    deliveryCharge: delivery,
    taxTotal: tax.taxTotal,
    taxLines: tax.lines,
    taxInclusive: tax.inclusive,
    shiftDate: sameShift ? reservation.shiftDate : localShiftDate,
    ...(sameShift && reservation.shiftNumber != null ? { shiftNumber: Number(reservation.shiftNumber) } : {}),
    ...(VALID_PAYMENT_METHODS.includes(paymentMethod) ? { paymentMethod } : {}),
    ...(type ? { orderType: type } : {}),
  }
}

/**
 * Checks that a queued sale adds up, and returns the invoice to store.
 *
 * The server cannot re-price these lines the way /api/checkout does. The sale
 * happened at a menu and a set of rates that may since have changed, and the
 * customer has already walked out with a receipt — re-pricing would either
 * fail on an item deleted in the meantime or quietly store a figure that is
 * not the one that was charged. So the figures are taken as given, and what is
 * checked instead is that they are *consistent*: that every line total follows
 * from its own price, quantity and discounts, that the subtotal is the sum of
 * them, that the tax lines sum to the tax total, and that the total is those
 * three added up the one way invoiceTotal adds them.
 *
 * That does not stop a determined member of staff from ringing up a discounted
 * sale — nothing does, because the normal checkout takes staff-supplied
 * discounts too. It does stop a malformed or truncated queue entry from
 * becoming an invoice whose parts disagree with its total, which is the
 * failure that would actually go unnoticed.
 */
export function validateOfflineInvoice(raw) {
  const fail = (error) => ({ error })
  if (!raw || typeof raw !== 'object') return fail('Malformed sale.')

  const id = String(raw.id ?? '')
  if (!/^inv-\d+$/.test(id)) return fail(`Not a reserved invoice number: ${id || '(none)'}`)

  const lines = Array.isArray(raw.lines) ? raw.lines : []
  if (!lines.length) return fail(`${id}: no lines.`)

  let subtotalExact = 0
  for (const line of lines) {
    const qty = Number(line?.qty)
    const unitPrice = Number(line?.unitPrice)
    const lineTotal = Number(line?.lineTotal)
    if (!Number.isFinite(qty) || qty < 1) return fail(`${id}: a line has no quantity.`)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return fail(`${id}: a line has no price.`)
    if (!Number.isFinite(lineTotal) || lineTotal < 0) return fail(`${id}: a line has no total.`)
    if (line.kind !== 'item' && line.kind !== 'deal') return fail(`${id}: a line is neither an item nor a deal.`)

    const expected = priceLine({
      unitPrice,
      qty,
      unitDiscount: Number(line.unitDiscount) || 0,
      lineDiscount: Number(line.lineDiscount) || 0,
    })
    if (Math.abs(expected.lineTotal - lineTotal) > CENT) {
      return fail(`${id}: a line total does not match its price and quantity.`)
    }
    subtotalExact += lineTotal
  }

  const subtotal = Number(raw.subtotal)
  if (!Number.isFinite(subtotal) || Math.abs(roundMoney(subtotalExact) - subtotal) > CENT) {
    return fail(`${id}: the subtotal is not the sum of the lines.`)
  }

  const taxLines = Array.isArray(raw.taxLines) ? raw.taxLines : []
  const taxTotal = Number(raw.taxTotal) || 0
  const taxSum = roundMoney(taxLines.reduce((s, t) => s + (Number(t?.amount) || 0), 0))
  if (Math.abs(taxSum - taxTotal) > CENT) return fail(`${id}: the tax lines do not sum to the tax charged.`)
  if (taxTotal < 0) return fail(`${id}: negative tax.`)

  const orderType = VALID_ORDER_TYPES.includes(raw.orderType) ? raw.orderType : null
  const rawDelivery = Number(raw.deliveryCharge)
  const deliveryCharge = orderType === 'delivery' && Number.isFinite(rawDelivery) && rawDelivery > 0
    ? roundMoney(rawDelivery)
    : 0

  const inclusive = Boolean(raw.taxInclusive)
  const total = Number(raw.total)
  const expectedTotal = invoiceTotal({ subtotal, deliveryCharge, taxTotal, inclusive })
  if (!Number.isFinite(total) || Math.abs(expectedTotal - total) > CENT) {
    return fail(`${id}: the total is not the subtotal, delivery and tax added up.`)
  }

  const createdAt = new Date(raw.createdAt)
  if (Number.isNaN(createdAt.getTime())) return fail(`${id}: no valid sale time.`)
  // A queued sale is by definition already in the past. One dated in the
  // future would land in a shift that has not happened and skew the day it
  // eventually reports into.
  const createdIso = (createdAt.getTime() > Date.now() ? new Date() : createdAt).toISOString()

  const shiftDate = typeof raw.shiftDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.shiftDate)
    ? raw.shiftDate
    : null
  if (!shiftDate) return fail(`${id}: no valid shift date.`)

  const shiftNumber = Number(raw.shiftNumber)

  return {
    invoice: {
      id,
      businessType: raw.businessType || invoiceBusinessTypeForLines(lines),
      orderId: null,
      createdAt: createdIso,
      customerNote: raw.customerNote ? String(raw.customerNote).slice(0, 200) : '',
      lines,
      subtotal,
      total,
      deliveryCharge,
      taxTotal,
      taxLines,
      taxInclusive: inclusive,
      shiftDate,
      ...(Number.isFinite(shiftNumber) && shiftNumber > 0 ? { shiftNumber } : {}),
      ...(VALID_PAYMENT_METHODS.includes(raw.paymentMethod) ? { paymentMethod: raw.paymentMethod } : {}),
      ...(orderType ? { orderType } : {}),
    },
  }
}
