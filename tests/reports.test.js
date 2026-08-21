import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateDealLineRevenue, calcInvoiceSplits, roundMoney } from '../lib/reports.js'

const sum = (parts) => roundMoney(parts.reduce((s, p) => s + p.revenue, 0))

test('a deal splits by the price the owner set for each item inside it', () => {
  const line = {
    qty: 1,
    lineTotal: 1000,
    dealIncludes: [
      { itemId: 'a', qty: 1, unitPrice: 600 },
      { itemId: 'b', qty: 1, unitPrice: 400 },
    ],
  }
  const parts = allocateDealLineRevenue(line, new Map())
  assert.deepEqual(parts.find((p) => p.itemId === 'a').revenue, 600)
  assert.deepEqual(parts.find((p) => p.itemId === 'b').revenue, 400)
})

test('an unpriced item falls back to its menu price, not to zero', () => {
  const line = {
    qty: 1,
    lineTotal: 1000,
    dealIncludes: [
      { itemId: 'a', qty: 1, unitPrice: null },
      { itemId: 'b', qty: 1, unitPrice: null },
    ],
  }
  const parts = allocateDealLineRevenue(line, new Map([['a', 750], ['b', 250]]))
  assert.equal(parts.find((p) => p.itemId === 'a').revenue, 750)
  assert.equal(parts.find((p) => p.itemId === 'b').revenue, 250)
})

test('a blank in-deal price is treated as unset, not as free', () => {
  // Number('') === 0 would silently value this item at nothing.
  const line = {
    qty: 1,
    lineTotal: 900,
    dealIncludes: [
      { itemId: 'a', qty: 1, unitPrice: '' },
      { itemId: 'b', qty: 1, unitPrice: 200 },
    ],
  }
  const parts = allocateDealLineRevenue(line, new Map([['a', 700]]))
  assert.ok(parts.find((p) => p.itemId === 'a').revenue > 0, 'blank price collapsed to zero revenue')
  assert.equal(sum(parts), 900)
})

test('a discounted deal line still reconciles exactly to what was charged', () => {
  const line = {
    qty: 1,
    lineTotal: 850, // sold below the stated 1000
    dealIncludes: [
      { itemId: 'a', qty: 1, unitPrice: 600 },
      { itemId: 'b', qty: 1, unitPrice: 400 },
    ],
  }
  const parts = allocateDealLineRevenue(line, new Map())
  assert.equal(sum(parts), 850)
})

test('rounding drift is absorbed so the parts always add up to the line total', () => {
  // 1000 / 3 does not divide evenly into paisa.
  const line = {
    qty: 1,
    lineTotal: 1000,
    dealIncludes: [
      { itemId: 'a', qty: 1, unitPrice: 1 },
      { itemId: 'b', qty: 1, unitPrice: 1 },
      { itemId: 'c', qty: 1, unitPrice: 1 },
    ],
  }
  const parts = allocateDealLineRevenue(line, new Map())
  assert.equal(sum(parts), 1000)
})

test('quantities multiply through the deal line quantity', () => {
  const line = {
    qty: 2, // two of this deal
    lineTotal: 2000,
    dealIncludes: [{ itemId: 'a', qty: 3, unitPrice: 100 }],
  }
  const parts = allocateDealLineRevenue(line, new Map())
  assert.equal(parts[0].units, 6, 'units should be 3 per deal x 2 deals')
  assert.equal(parts[0].revenue, 2000)
})

test('items with neither a stated nor a menu price split evenly per unit', () => {
  const line = {
    qty: 1,
    lineTotal: 300,
    dealIncludes: [
      { itemId: 'a', qty: 1 },
      { itemId: 'b', qty: 2 },
    ],
  }
  const parts = allocateDealLineRevenue(line, new Map())
  assert.equal(sum(parts), 300)
  assert.equal(parts.find((p) => p.itemId === 'a').revenue, 100)
  assert.equal(parts.find((p) => p.itemId === 'b').revenue, 200)
})

// Chacha's two counters. calcInvoiceSplits takes the tenant's own brands now,
// so these tests pass the pair that used to be hardcoded inside it — the
// behaviour for that pair must not have changed.
const CHACHA = [{ slug: 'cafe' }, { slug: 'burger' }]
const portions = (inv, brands = CHACHA) => Object.fromEntries(calcInvoiceSplits(inv, brands))

test('a combined deal credits each business its own portion', () => {
  const inv = {
    total: 2000,
    lines: [{ isCombined: true, qty: 1, lineTotal: 2000, cafeSplit: 1600, burgerSplit: 400 }],
  }
  assert.deepEqual(portions(inv), { cafe: 1600, burger: 400 })
})

test('a discount on a combined deal is shared 50/50 between the businesses', () => {
  const inv = {
    total: 1900,
    lines: [{ isCombined: true, qty: 1, lineTotal: 1900, cafeSplit: 1600, burgerSplit: 400, discount: 100 }],
  }
  const p = portions(inv)
  assert.equal(p.cafe, 1550)
  assert.equal(p.burger, 350)
  assert.equal(roundMoney(p.cafe + p.burger), 1900)
})

test('shared "both" items are credited to the first brand', () => {
  const inv = { total: 500, lines: [{ lineBusinessType: 'both', qty: 1, lineTotal: 500 }] }
  assert.deepEqual(portions(inv), { cafe: 500, burger: 0 })
})

test('legacy lines with no business tag fall back to the invoice business', () => {
  const inv = { total: 300, lines: [{ qty: 1, lineTotal: 300 }] }
  assert.equal(portions({ ...inv, businessType: 'burger' }).burger, 300)
  assert.equal(portions({ ...inv, businessType: 'cafe' }).cafe, 300)
})

test('an invoice with no lines still attributes its total', () => {
  assert.equal(portions({ total: 250, lines: [], businessType: 'burger' }).burger, 250)
  assert.equal(portions({ total: 250, lines: [], businessType: 'cafe' }).cafe, 250)
})

test('a café with a single brand gets everything credited to it', () => {
  // The shape Chacha's two-column split could never represent. Lines tagged
  // with a brand this tenant does not have still land somewhere rather than
  // vanishing.
  const solo = [{ slug: 'main' }]
  const inv = {
    total: 800,
    lines: [
      { lineBusinessType: 'main', qty: 1, lineTotal: 500 },
      { lineBusinessType: 'cafe', qty: 1, lineTotal: 300 },
    ],
  }
  assert.deepEqual(portions(inv, solo), { main: 800 })
})

test('a café with three brands gets a column for each, including empty ones', () => {
  const three = [{ slug: 'coffee' }, { slug: 'bakery' }, { slug: 'deli' }]
  const inv = {
    total: 700,
    lines: [
      { lineBusinessType: 'coffee', qty: 1, lineTotal: 400 },
      { lineBusinessType: 'deli', qty: 1, lineTotal: 300 },
    ],
  }
  assert.deepEqual(portions(inv, three), { coffee: 400, bakery: 0, deli: 300 })
})

test('brandSplits keyed by slug take precedence over the legacy pair', () => {
  const inv = {
    total: 900,
    lines: [{
      isCombined: true, qty: 1, lineTotal: 900,
      brandSplits: { coffee: 600, bakery: 300 },
      cafeSplit: 999, burgerSplit: 999,
    }],
  }
  assert.deepEqual(portions(inv, [{ slug: 'coffee' }, { slug: 'bakery' }]), { coffee: 600, bakery: 300 })
})

test('every brand appears in the result even when it sold nothing', () => {
  const inv = { total: 100, lines: [{ lineBusinessType: 'cafe', qty: 1, lineTotal: 100 }] }
  assert.deepEqual(Object.keys(portions(inv)), ['cafe', 'burger'])
})
