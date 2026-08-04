import test from 'node:test'
import assert from 'node:assert/strict'
import { priceLine, discountPartsOf, repriceLine, roundMoney } from '../lib/pricing.js'

test('a per-unit discount scales with quantity', () => {
  const r = priceLine({ unitPrice: 200, qty: 3, unitDiscount: 20 })
  assert.equal(r.discount, 60)
  assert.equal(r.lineTotal, 540)
})

test('a line discount is taken once, not per unit', () => {
  const r = priceLine({ unitPrice: 200, qty: 3, lineDiscount: 20 })
  assert.equal(r.discount, 20)
  assert.equal(r.lineTotal, 580)
})

test('both discounts can apply to the same line and sum into `discount`', () => {
  const r = priceLine({ unitPrice: 100, qty: 2, unitDiscount: 10, lineDiscount: 30 })
  assert.equal(r.unitDiscount, 10)
  assert.equal(r.lineDiscount, 30)
  assert.equal(r.discount, 50) // 10*2 + 30
  assert.equal(r.lineTotal, 150)
})

test('a per-unit discount can never exceed the unit price', () => {
  const r = priceLine({ unitPrice: 100, qty: 2, unitDiscount: 250 })
  assert.equal(r.unitDiscount, 100)
  assert.equal(r.lineTotal, 0)
})

test('a line discount cannot eat more than what the unit discount left', () => {
  // gross 200, unit discount takes 100, so at most 100 remains to give away
  const r = priceLine({ unitPrice: 100, qty: 2, unitDiscount: 50, lineDiscount: 5000 })
  assert.equal(r.lineDiscount, 100)
  assert.equal(r.lineTotal, 0)
})

test('a line total is never negative', () => {
  const r = priceLine({ unitPrice: 50, qty: 1, unitDiscount: 999, lineDiscount: 999 })
  assert.ok(r.lineTotal >= 0, `expected >= 0, got ${r.lineTotal}`)
})

test('negative and junk discounts are ignored rather than adding money', () => {
  for (const bad of [-100, 'abc', NaN, null, undefined]) {
    const r = priceLine({ unitPrice: 100, qty: 2, unitDiscount: bad, lineDiscount: bad })
    assert.equal(r.lineTotal, 200, `discount ${String(bad)} changed the total`)
  }
})

test('quantity is floored to a whole number and never below 1', () => {
  assert.equal(priceLine({ unitPrice: 100, qty: 2.9 }).qty, 2)
  assert.equal(priceLine({ unitPrice: 100, qty: 0 }).qty, 1)
  assert.equal(priceLine({ unitPrice: 100, qty: -5 }).qty, 1)
})

test('legacy lines carrying only `discount` are read as a row-level discount', () => {
  // Saved before per-unit discounts existed.
  const parts = discountPartsOf({ discount: 75, qty: 3 })
  assert.deepEqual(parts, { unitDiscount: 0, lineDiscount: 75 })
})

test('repricing on a quantity change keeps the per-unit discount per-unit', () => {
  const line = { unitPrice: 200, qty: 2, unitDiscount: 20, discount: 40, lineTotal: 360 }
  const next = repriceLine(line, { qty: 4 })
  assert.equal(next.qty, 4)
  assert.equal(next.discount, 80) // 20 x 4, not still 40
  assert.equal(next.lineTotal, 720)
})

test('repricing drops discount keys once the discount is cleared', () => {
  const line = { unitPrice: 100, qty: 1, unitDiscount: 10, discount: 10, lineTotal: 90 }
  const next = repriceLine(line, { unitDiscount: 0 })
  assert.ok(!('unitDiscount' in next), 'unitDiscount should be removed, not left at 0')
  assert.ok(!('discount' in next), 'discount should be removed, not left at 0')
  assert.equal(next.lineTotal, 100)
})

test('money rounds to two decimals', () => {
  assert.equal(roundMoney(10.005), 10.01)
  assert.equal(roundMoney(0.1 + 0.2), 0.3)
})
