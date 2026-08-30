import test from 'node:test'
import assert from 'node:assert/strict'
import { buildZReport, parseCloseInput } from '../lib/zReport.js'

const sale = (over = {}) => ({
  id: 'inv-1',
  lines: [{ kind: 'item', qty: 1, unitPrice: 10, lineTotal: 10, unitDiscount: 0, lineDiscount: 0 }],
  subtotal: 10,
  total: 10,
  taxTotal: 0,
  taxLines: [],
  taxInclusive: false,
  deliveryCharge: 0,
  returned: false,
  paymentMethod: 'cash',
  ...over,
})

// ── The takings ─────────────────────────────────────────────────────────────

test('an empty day balances against its float', () => {
  const z = buildZReport({ shiftDate: '2026-08-30', openingFloat: 100, countedCash: 100 })
  assert.equal(z.saleCount, 0)
  assert.equal(z.grossSales, 0)
  assert.equal(z.expectedCash, 100)
  assert.equal(z.variance, 0)
})

test('cash sales are added to the float and card sales are not', () => {
  const z = buildZReport({
    openingFloat: 50,
    invoices: [
      sale({ id: 'a', total: 10, paymentMethod: 'cash' }),
      sale({ id: 'b', total: 25, paymentMethod: 'online' }),
    ],
  })
  assert.equal(z.grossSales, 35)
  // Only the tenner ever reached the drawer.
  assert.equal(z.cashTaken, 10)
  assert.equal(z.expectedCash, 60)
  assert.deepEqual(
    z.byMethod,
    [{ method: 'cash', count: 1, total: 10 }, { method: 'online', count: 1, total: 25 }],
  )
})

test('an unmarked sale is counted as unpaid rather than folded into cash', () => {
  // Folding it into cash would make the drawer look short by exactly that
  // amount, with nothing on the report to say why.
  const z = buildZReport({
    openingFloat: 0,
    invoices: [sale({ total: 12, paymentMethod: null })],
  })
  assert.equal(z.unpaidCount, 1)
  assert.equal(z.unpaidTotal, 12)
  assert.equal(z.cashTaken, 0)
  assert.equal(z.expectedCash, 0)
})

test('net sales excludes tax, and tax is reported per rate', () => {
  const z = buildZReport({
    invoices: [
      sale({
        id: 'a', subtotal: 100, total: 108, taxTotal: 8, taxInclusive: false,
        taxLines: [
          { id: 'r1', name: 'State', rate: 6, amount: 6 },
          { id: 'r2', name: 'City', rate: 2, amount: 2 },
        ],
      }),
    ],
  })
  assert.equal(z.grossSales, 108)
  assert.equal(z.netSales, 100)
  assert.equal(z.taxCollected, 8)
  assert.deepEqual(z.taxByRate.map((t) => [t.name, t.amount]), [['State', 6], ['City', 2]])
})

test('inclusive tax comes back out of net sales', () => {
  // The subtotal already contains it, so counting the subtotal as net would
  // overstate the café's takings by the rate.
  const z = buildZReport({
    invoices: [sale({ subtotal: 100, total: 100, taxTotal: 5, taxInclusive: true })],
  })
  assert.equal(z.grossSales, 100)
  assert.equal(z.netSales, 95)
})

test('the same rate charged on several sales is totalled once', () => {
  const line = { id: 'r1', name: 'State', rate: 6, amount: 3 }
  const z = buildZReport({
    invoices: [
      sale({ id: 'a', taxTotal: 3, taxLines: [line] }),
      sale({ id: 'b', taxTotal: 3, taxLines: [line] }),
    ],
  })
  assert.equal(z.taxByRate.length, 1)
  assert.equal(z.taxByRate[0].amount, 6)
  assert.equal(z.taxCollected, 6)
})

// ── Refunds ─────────────────────────────────────────────────────────────────

test('a cash refund comes out of the drawer', () => {
  const z = buildZReport({
    openingFloat: 100,
    invoices: [
      sale({ id: 'a', total: 20, paymentMethod: 'cash' }),
      sale({ id: 'b', total: 5, paymentMethod: 'cash', returned: true }),
    ],
  })
  assert.equal(z.refundCount, 1)
  assert.equal(z.refundTotal, 5)
  assert.equal(z.cashRefunds, 5)
  // 100 float + 25 taken - 5 given back.
  assert.equal(z.expectedCash, 120)
})

test('a card refund does not touch the drawer', () => {
  // It goes back to the card, so taking it off expected cash would show a
  // shortfall that was never in the drawer.
  const z = buildZReport({
    openingFloat: 100,
    invoices: [sale({ total: 30, paymentMethod: 'online', returned: true })],
  })
  assert.equal(z.refundTotal, 30)
  assert.equal(z.cashRefunds, 0)
  assert.equal(z.expectedCash, 100)
})

test('a returned sale still appears in the day’s takings', () => {
  // The report shows the day that happened, not a tidied version — the sale
  // was rung up and the refund reversed it, and both are movements of money.
  const z = buildZReport({ invoices: [sale({ total: 20, returned: true })] })
  assert.equal(z.saleCount, 1)
  assert.equal(z.grossSales, 20)
  assert.equal(z.refundTotal, 20)
})

// ── Cash paid out ───────────────────────────────────────────────────────────

test('cash paid out of the drawer reduces what should be in it', () => {
  const z = buildZReport({
    openingFloat: 100,
    invoices: [sale({ total: 40, paymentMethod: 'cash' })],
    expenses: [{ amount: 15 }, { amount: 5 }],
  })
  assert.equal(z.cashPaidOut, 20)
  assert.equal(z.expectedCash, 120)
})

// ── The variance, which is the point ────────────────────────────────────────

test('a drawer that is short reports a negative variance', () => {
  const z = buildZReport({
    openingFloat: 50,
    invoices: [sale({ total: 100, paymentMethod: 'cash' })],
    countedCash: 145,
  })
  assert.equal(z.expectedCash, 150)
  assert.equal(z.variance, -5)
})

test('a drawer that is over reports a positive variance', () => {
  // Signed rather than absolute: a till repeatedly over is its own problem,
  // usually being rung up wrong rather than anybody stealing.
  const z = buildZReport({
    openingFloat: 50,
    invoices: [sale({ total: 100, paymentMethod: 'cash' })],
    countedCash: 153.5,
  })
  assert.equal(z.variance, 3.5)
})

test('an uncounted drawer has no variance rather than a variance of zero', () => {
  // Zero would read as "counted and correct", which is the opposite of what an
  // uncounted drawer means.
  const z = buildZReport({ openingFloat: 50, invoices: [sale({ paymentMethod: 'cash' })] })
  assert.equal(z.countedCash, null)
  assert.equal(z.variance, null)
})

test('discounts given are read back off the stored lines', () => {
  const z = buildZReport({
    invoices: [sale({
      lines: [
        { kind: 'item', qty: 2, unitPrice: 10, unitDiscount: 1, lineDiscount: 0, lineTotal: 18 },
        { kind: 'item', qty: 1, unitPrice: 10, unitDiscount: 0, lineDiscount: 3, lineTotal: 7 },
      ],
    })],
  })
  // Two units at 1 off, plus 3 off the row.
  assert.equal(z.discountsGiven, 5)
})

test('delivery charges are reported apart from the sales', () => {
  const z = buildZReport({
    invoices: [sale({ total: 15, deliveryCharge: 5, orderType: 'delivery' })],
  })
  assert.equal(z.deliveryCharges, 5)
})

test('money arithmetic does not drift across many small sales', () => {
  const invoices = Array.from({ length: 30 }, (_, i) =>
    sale({ id: `inv-${i}`, subtotal: 0.1, total: 0.1, paymentMethod: 'cash' }))
  const z = buildZReport({ openingFloat: 0, invoices, countedCash: 3 })
  assert.equal(z.grossSales, 3)
  assert.equal(z.expectedCash, 3)
  assert.equal(z.variance, 0)
})

// ── What a person types ─────────────────────────────────────────────────────

test('closing without counting the drawer is refused', () => {
  // A blank box read as zero would record a drawer nobody counted as an empty
  // one, and file a variance to match.
  for (const body of [{}, { countedCash: '' }, { countedCash: null }]) {
    assert.match(parseCloseInput(body).error, /Count the drawer/)
  }
})

test('a nonsense count is refused', () => {
  assert.match(parseCloseInput({ countedCash: -5 }).error, /0 or more/)
  assert.match(parseCloseInput({ countedCash: 'lots' }).error, /0 or more/)
})

test('a count of zero is legal — an empty drawer is a real answer', () => {
  const { value, error } = parseCloseInput({ countedCash: 0 })
  assert.equal(error, undefined)
  assert.equal(value.countedCash, 0)
})

test('the float defaults to nothing but is refused if it is nonsense', () => {
  assert.equal(parseCloseInput({ countedCash: 10 }).value.openingFloat, 0)
  assert.match(parseCloseInput({ countedCash: 10, openingFloat: -1 }).error, /0 or more/)
})

test('a note is trimmed and capped', () => {
  const { value } = parseCloseInput({ countedCash: 10, note: '  new starter on the till  ' })
  assert.equal(value.note, 'new starter on the till')
  const long = parseCloseInput({ countedCash: 10, note: 'x'.repeat(500) })
  assert.equal(long.value.note.length, 300)
})
