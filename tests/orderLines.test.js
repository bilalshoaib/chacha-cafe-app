import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOrderLine } from '../lib/orderLines.js'

const menu = {
  items: [
    { id: 'i1', name: 'Zinger', category: 'burgers', price: 500 },
    { id: 'i2', name: 'Latte', category: 'coffee', price: 300, businessType: 'cafe' },
  ],
  deals: [{ id: 'd1', name: 'Meal', price: 700, includes: [{ itemId: 'i1', qty: 1 }], status: 'active' }],
}

test('a line is priced from the menu, not from what the till sent', () => {
  const { line } = buildOrderLine({ kind: 'item', refId: 'i2', qty: 2, unitPrice: 1 }, menu)
  assert.equal(line.unitPrice, 300)
  assert.equal(line.lineTotal, 600)
})

// The till prices every sale with this now, and reports split takings by it.
test('each line carries the counter it belongs to', () => {
  assert.equal(buildOrderLine({ kind: 'item', refId: 'i1', qty: 1 }, menu).line.lineBusinessType, 'burger')
  assert.equal(buildOrderLine({ kind: 'deal', refId: 'd1', qty: 1 }, menu).line.lineBusinessType, 'burger')
})

test('an item the menu no longer has is refused', () => {
  assert.equal(buildOrderLine({ kind: 'item', refId: 'gone', qty: 1 }, menu).status, 404)
})
