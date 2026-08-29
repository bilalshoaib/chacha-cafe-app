import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeInvoiceTax, invoiceTotal, netOfTax, rateApplies,
  parseTaxRateInput, TAX_ORDER_TYPES, MAX_TAX_RATE,
} from '../lib/tax.js'

const stateTax = { id: 'r1', name: 'State Tax', rate: 6.25, orderTypes: [], categories: [], enabled: true }
const cityTax  = { id: 'r2', name: 'City Tax',  rate: 2.5,  orderTypes: [], categories: [], enabled: true }

const line = (over = {}) => ({ kind: 'item', category: 'coffee', lineTotal: 100, ...over })

// ── Which rates apply ───────────────────────────────────────────────────────

test('a rate with no restrictions applies to everything', () => {
  assert.ok(rateApplies(stateTax, { orderType: 'dine_in', category: 'coffee' }))
  assert.ok(rateApplies(stateTax, { orderType: null, category: null }))
})

test('a rate restricted to an order type applies only to that one', () => {
  const dineIn = { ...stateTax, orderTypes: ['dine_in'] }
  assert.ok(rateApplies(dineIn, { orderType: 'dine_in' }))
  assert.ok(!rateApplies(dineIn, { orderType: 'takeaway' }))
})

test('a rate restricted to an order type does not apply to an order that has not said which it is', () => {
  // Charging it anyway would put a dine-in surcharge on a ticket nobody has
  // said is dine-in, which is the direction that overcharges the customer.
  const dineIn = { ...stateTax, orderTypes: ['dine_in'] }
  assert.ok(!rateApplies(dineIn, { orderType: null }))
})

test('a rate restricted to categories applies only to items in them', () => {
  const preparedFood = { ...stateTax, categories: ['coffee', 'pastry'] }
  assert.ok(rateApplies(preparedFood, { category: 'coffee' }))
  assert.ok(!rateApplies(preparedFood, { category: 'beans' }))
})

test('a category-restricted rate never applies to a deal', () => {
  // A deal spans categories at one bundled price, so "tax prepared food but
  // not packaged goods" has no answer for it.
  const preparedFood = { ...stateTax, categories: ['coffee'] }
  assert.ok(!rateApplies(preparedFood, { category: 'coffee', kind: 'deal' }))
  assert.ok(rateApplies(stateTax, { category: null, kind: 'deal' }))
})

test('a switched-off or zero rate applies to nothing', () => {
  assert.ok(!rateApplies({ ...stateTax, enabled: false }, {}))
  assert.ok(!rateApplies({ ...stateTax, rate: 0 }, {}))
})

// ── Tax-exclusive: the tax is added on top ──────────────────────────────────

test('exclusive tax is a percentage added to the lines it applies to', () => {
  const tax = computeInvoiceTax({ lines: [line()], rates: [stateTax], pricesIncludeTax: false })
  assert.equal(tax.inclusive, false)
  assert.equal(tax.taxTotal, 6.25)
  assert.equal(tax.taxableTotal, 100)
  assert.deepEqual(tax.lines.map((l) => [l.name, l.rate, l.amount]), [['State Tax', 6.25, 6.25]])
})

test('two exclusive rates are each charged on the full line and broken out separately', () => {
  const tax = computeInvoiceTax({ lines: [line()], rates: [stateTax, cityTax], pricesIncludeTax: false })
  assert.equal(tax.taxTotal, 8.75)
  assert.deepEqual(tax.lines.map((l) => l.amount), [6.25, 2.5])
})

test('exclusive tax grows the total; the subtotal is untouched', () => {
  const tax = computeInvoiceTax({ lines: [line()], rates: [stateTax], pricesIncludeTax: false })
  assert.equal(invoiceTotal({ subtotal: 100, deliveryCharge: 0, taxTotal: tax.taxTotal, inclusive: false }), 106.25)
})

test('a category rate taxes only its own lines', () => {
  const preparedFood = { ...stateTax, categories: ['coffee'] }
  const tax = computeInvoiceTax({
    lines: [line({ category: 'coffee', lineTotal: 100 }), line({ category: 'beans', lineTotal: 50 })],
    rates: [preparedFood],
    pricesIncludeTax: false,
  })
  assert.equal(tax.taxableTotal, 100)
  assert.equal(tax.taxTotal, 6.25)
})

// ── Tax-inclusive: the tax is already in the price ───────────────────────────

test('inclusive tax is carved out of the price rather than added to it', () => {
  // 106.25 at 6.25% inclusive is 100.00 net and 6.25 tax.
  const tax = computeInvoiceTax({ lines: [line({ lineTotal: 106.25 })], rates: [stateTax], pricesIncludeTax: true })
  assert.equal(tax.inclusive, true)
  assert.equal(tax.taxTotal, 6.25)
  assert.equal(tax.taxableTotal, 100)
})

test('inclusive tax leaves the total exactly as quoted', () => {
  const tax = computeInvoiceTax({ lines: [line({ lineTotal: 106.25 })], rates: [stateTax], pricesIncludeTax: true })
  assert.equal(invoiceTotal({ subtotal: 106.25, deliveryCharge: 0, taxTotal: tax.taxTotal, inclusive: true }), 106.25)
})

test('two inclusive rates come out of one price, not one each out of the whole', () => {
  // The wrong answer — 8.75% of 108.75 taken twice over — is 9.52. The right
  // one divides by the combined rate once and splits what comes out.
  const tax = computeInvoiceTax({ lines: [line({ lineTotal: 108.75 })], rates: [stateTax, cityTax], pricesIncludeTax: true })
  assert.equal(tax.taxTotal, 8.75)
  assert.equal(tax.taxableTotal, 100)
  assert.deepEqual(tax.lines.map((l) => l.amount), [6.25, 2.5])
})

test('the broken-out inclusive amounts always add up to the tax total', () => {
  // Rounding a proportional split can leave a cent unassigned; it has to land
  // somewhere or subtotal-minus-tax stops matching the printed net.
  const odd = { id: 'r3', name: 'Transit', rate: 0.375, orderTypes: [], categories: [], enabled: true }
  const tax = computeInvoiceTax({
    lines: [line({ lineTotal: 13.37 }), line({ lineTotal: 7.99 }), line({ lineTotal: 4.05 })],
    rates: [stateTax, cityTax, odd],
    pricesIncludeTax: true,
  })
  const summed = tax.lines.reduce((s, l) => s + l.amount, 0)
  assert.equal(Math.round(summed * 100) / 100, tax.taxTotal)
})

test('delivery is never taxed', () => {
  const tax = computeInvoiceTax({ lines: [line()], rates: [stateTax], orderType: 'delivery', pricesIncludeTax: false })
  assert.equal(tax.taxableTotal, 100)
  assert.equal(invoiceTotal({ subtotal: 100, deliveryCharge: 200, taxTotal: tax.taxTotal, inclusive: false }), 306.25)
})

// ── A café with no tax configured ───────────────────────────────────────────

test('a café with no rates gets no tax and an unchanged total, either way round', () => {
  for (const pricesIncludeTax of [true, false]) {
    const tax = computeInvoiceTax({ lines: [line()], rates: [], pricesIncludeTax })
    assert.equal(tax.taxTotal, 0)
    assert.deepEqual(tax.lines, [])
    assert.equal(invoiceTotal({ subtotal: 100, deliveryCharge: 5, taxTotal: 0, inclusive: pricesIncludeTax }), 105)
  }
})

test('a rate that applies to nothing on the ticket produces no receipt line', () => {
  const beansOnly = { ...stateTax, categories: ['beans'] }
  const tax = computeInvoiceTax({ lines: [line({ category: 'coffee' })], rates: [beansOnly], pricesIncludeTax: false })
  assert.equal(tax.taxTotal, 0)
  assert.deepEqual(tax.lines, [])
})

// ── What the sale was worth to the business ─────────────────────────────────

test('net of tax removes inclusive tax from the subtotal and leaves exclusive alone', () => {
  assert.equal(netOfTax({ subtotal: 106.25, taxTotal: 6.25, taxInclusive: true }), 100)
  assert.equal(netOfTax({ subtotal: 100, taxTotal: 6.25, taxInclusive: false }), 100)
})

test('an invoice from before tax existed is net of nothing', () => {
  assert.equal(netOfTax({ subtotal: 100 }), 100)
})

// ── Validation on the way in ────────────────────────────────────────────────

test('a rate needs a name, because the name is printed on the receipt', () => {
  assert.ok(parseTaxRateInput({ rate: 5 }).error)
  assert.ok(parseTaxRateInput({ name: '   ', rate: 5 }).error)
})

test('an impossible percentage is refused rather than defaulted', () => {
  assert.ok(parseTaxRateInput({ name: 'X', rate: -1 }).error)
  assert.ok(parseTaxRateInput({ name: 'X', rate: MAX_TAX_RATE + 1 }).error)
  assert.ok(parseTaxRateInput({ name: 'X', rate: 'nine' }).error)
})

test('a valid rate comes back normalised', () => {
  const { rate } = parseTaxRateInput({ name: '  State Tax  ', rate: '6.2500' })
  assert.equal(rate.name, 'State Tax')
  assert.equal(rate.rate, 6.25)
  assert.deepEqual(rate.orderTypes, [])
  assert.equal(rate.enabled, true)
})

test('selecting every order type is stored as no restriction at all', () => {
  // So that adding a fourth order type later does not silently exclude it from
  // a rate whose owner meant "all of them".
  const { rate } = parseTaxRateInput({ name: 'X', rate: 5, orderTypes: [...TAX_ORDER_TYPES] })
  assert.deepEqual(rate.orderTypes, [])
})

test('an unknown order type is refused', () => {
  assert.ok(parseTaxRateInput({ name: 'X', rate: 5, orderTypes: ['drive_thru'] }).error)
})

test('a patch merges rather than replaces, so an unmentioned field survives', () => {
  const existing = { name: 'State Tax', rate: 6.25, orderTypes: ['dine_in'], categories: ['coffee'], enabled: true, sortOrder: 2 }
  const { rate } = parseTaxRateInput({ rate: 7 }, existing)
  assert.equal(rate.rate, 7)
  assert.equal(rate.name, 'State Tax')
  assert.deepEqual(rate.orderTypes, ['dine_in'])
  assert.deepEqual(rate.categories, ['coffee'])
  assert.equal(rate.sortOrder, 2)
})
