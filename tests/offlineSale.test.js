import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOfflineInvoice, validateOfflineInvoice } from '../lib/offlineSale.js'

const stateTax = { id: 'r1', name: 'State Tax', rate: 4, orderTypes: [], categories: [], enabled: true }

// A line as the till holds it: already priced by lib/pricing.js, which is what
// buildOfflineInvoice is handed.
const line = (over = {}) => ({
  id: 'l1', kind: 'item', refId: 'i1', name: 'Latte', category: 'coffee',
  unitPrice: 5, qty: 2, unitDiscount: 0, lineDiscount: 0, lineTotal: 10,
  ...over,
})

const reservation = { invoiceNumber: 1201, shiftNumber: 7, shiftDate: '2026-08-30' }

// Mid-afternoon, comfortably inside a shift that starts at 18:00 — so the
// shift date is the previous calendar day and the arithmetic is stable
// whatever machine runs the test.
const duringShift = new Date('2026-08-30T14:00:00Z')

// ── Building the sale on the device ─────────────────────────────────────────

test('an offline sale takes its number from the reserved block', () => {
  const inv = buildOfflineInvoice({
    lines: [line()], reservation, rates: [], pricesIncludeTax: true, now: duringShift,
  })
  assert.equal(inv.id, 'inv-1201')
  assert.equal(inv.shiftNumber, 7)
})

test('an offline sale is priced and taxed by the same code the server runs', () => {
  const inv = buildOfflineInvoice({
    lines: [line()],
    reservation,
    rates: [stateTax],
    pricesIncludeTax: false,
    orderType: 'dine_in',
    now: duringShift,
  })
  assert.equal(inv.subtotal, 10)
  assert.equal(inv.taxTotal, 0.4)
  assert.equal(inv.total, 10.4)
  assert.equal(inv.taxInclusive, false)
  assert.equal(inv.taxLines.length, 1)
})

test('inclusive pricing leaves the total alone and carves the tax out', () => {
  const inv = buildOfflineInvoice({
    lines: [line()], reservation, rates: [stateTax], pricesIncludeTax: true, now: duringShift,
  })
  assert.equal(inv.total, 10)
  assert.ok(inv.taxTotal > 0)
  assert.equal(inv.taxInclusive, true)
})

test('delivery is charged only on a delivery order', () => {
  const asDelivery = buildOfflineInvoice({
    lines: [line()], reservation, orderType: 'delivery', deliveryCharge: 3, now: duringShift,
  })
  assert.equal(asDelivery.deliveryCharge, 3)
  assert.equal(asDelivery.total, 13)

  const asDineIn = buildOfflineInvoice({
    lines: [line()], reservation, orderType: 'dine_in', deliveryCharge: 3, now: duringShift,
  })
  assert.equal(asDineIn.deliveryCharge, 0)
})

test('a sale rung up after the café’s day rolls over takes no order number', () => {
  // The block was reserved against 2026-08-30. Selling at 20:00 with a day
  // that starts at 18:00 puts this sale in the next shift, whose order numbers
  // belong to somebody else — so it goes without one and the server assigns it.
  const inv = buildOfflineInvoice({
    lines: [line()],
    reservation,
    dayStartHour: 18,
    now: new Date('2026-08-31T20:00:00+05:00'),
  })
  assert.equal(inv.shiftNumber, undefined)
  assert.notEqual(inv.shiftDate, reservation.shiftDate)
  // The invoice number is still spent and still final — it is the order number
  // alone that is shift-bound.
  assert.equal(inv.id, 'inv-1201')
})

test('a sale with no reserved number cannot be built', () => {
  assert.throws(() => buildOfflineInvoice({ lines: [line()], reservation: null }), /reserved invoice number/)
})

test('an empty cart cannot be checked out offline either', () => {
  assert.throws(() => buildOfflineInvoice({ lines: [], reservation }), /at least one line/)
})

// ── Checking it on the way back in ──────────────────────────────────────────

const validSale = () => buildOfflineInvoice({
  lines: [line()], reservation, rates: [stateTax], pricesIncludeTax: false,
  orderType: 'dine_in', now: duringShift,
})

test('a sale the till built passes the check the server makes', () => {
  const { invoice, error } = validateOfflineInvoice(validSale())
  assert.equal(error, undefined)
  assert.equal(invoice.id, 'inv-1201')
  assert.equal(invoice.total, 10.4)
})

test('a total that is not the sum of its parts is refused', () => {
  const { error } = validateOfflineInvoice({ ...validSale(), total: 5 })
  assert.match(error, /total is not the subtotal/)
})

test('a subtotal that is not the sum of the lines is refused', () => {
  const { error } = validateOfflineInvoice({ ...validSale(), subtotal: 99, total: 99.4 })
  assert.match(error, /subtotal is not the sum/)
})

test('a line total that does not follow from its price and quantity is refused', () => {
  const sale = validSale()
  const { error } = validateOfflineInvoice({
    ...sale,
    lines: [{ ...line(), lineTotal: 4 }],
    subtotal: 4,
    total: 4.4,
  })
  assert.match(error, /line total does not match/)
})

test('tax lines that do not sum to the tax charged are refused', () => {
  const sale = validSale()
  const { error } = validateOfflineInvoice({ ...sale, taxTotal: 5, total: 15 })
  assert.match(error, /tax lines do not sum/)
})

test('an invoice id that did not come from the sequence is refused', () => {
  const { error } = validateOfflineInvoice({ ...validSale(), id: 'inv-abc' })
  assert.match(error, /Not a reserved invoice number/)
})

test('a discounted line still validates, because staff are allowed to discount', () => {
  // The check is that the arithmetic holds together, not that the price is one
  // the manager would have approved — the ordinary checkout takes staff
  // discounts too, so refusing them here would only refuse them offline.
  const discounted = { ...line(), unitDiscount: 1, lineTotal: 8 }
  const sale = buildOfflineInvoice({
    lines: [discounted], reservation, rates: [], now: duringShift,
  })
  const { invoice, error } = validateOfflineInvoice(sale)
  assert.equal(error, undefined)
  assert.equal(invoice.subtotal, 8)
})

test('a sale dated in the future is pulled back to now', () => {
  const sale = { ...validSale(), createdAt: new Date(Date.now() + 86400000).toISOString() }
  const { invoice } = validateOfflineInvoice(sale)
  assert.ok(new Date(invoice.createdAt).getTime() <= Date.now() + 1000)
})

test('a malformed entry is refused rather than thrown on', () => {
  for (const bad of [null, undefined, 'nope', 42, {}]) {
    const { error, invoice } = validateOfflineInvoice(bad)
    assert.ok(error, `expected ${JSON.stringify(bad)} to be refused`)
    assert.equal(invoice, undefined)
  }
})

test('a delivery charge on a dine-in sale is dropped, not honoured', () => {
  // The charge is ignored the same way the ordinary checkout ignores it, so a
  // sale that is not a delivery cannot carry one. The total it was printed
  // with still has to hold up without it — which is what stops this being a
  // way to add money the line items do not account for.
  const sale = { ...validSale(), orderType: 'dine_in', deliveryCharge: 50 }
  const { invoice, error } = validateOfflineInvoice(sale)
  assert.equal(error, undefined)
  assert.equal(invoice.deliveryCharge, 0)
  assert.equal(invoice.total, 10.4)
})

test('a delivery charge that is in the total is kept on a delivery sale', () => {
  const sale = buildOfflineInvoice({
    lines: [line()], reservation, orderType: 'delivery', deliveryCharge: 3, now: duringShift,
  })
  const { invoice, error } = validateOfflineInvoice(sale)
  assert.equal(error, undefined)
  assert.equal(invoice.deliveryCharge, 3)
  assert.equal(invoice.total, 13)
})

test('a delivery total the charge does not account for is refused', () => {
  // The inverse of the case above: a total inflated past what the lines and a
  // legitimate delivery charge add up to.
  const sale = { ...validSale(), orderType: 'delivery', deliveryCharge: 3, total: 99 }
  const { error } = validateOfflineInvoice(sale)
  assert.match(error, /total is not the subtotal/)
})
