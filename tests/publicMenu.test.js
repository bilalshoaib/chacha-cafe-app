import test from 'node:test'
import assert from 'node:assert/strict'
import { toPublicMenu } from '../lib/publicMenu.js'

const menu = {
  items: [
    { id: 'i-1', name: 'Zinger', category: 'burger', price: 200, costPrice: 120, size: 'large' },
    { id: 'i-2', name: 'Cola', category: 'drinks', price: 80, costPrice: null },
  ],
  deals: [
    {
      id: 'd-1',
      name: 'Family Deal',
      price: 1000,
      includes: [
        { itemId: 'i-1', qty: 2, unitPrice: 180 },
        { itemId: 'i-2', qty: 4, unitPrice: null },
      ],
    },
  ],
}

test('item cost prices never reach the public payload', () => {
  const publicMenu = toPublicMenu(menu)
  for (const item of publicMenu.items) {
    assert.ok(!('costPrice' in item), `${item.name} still carries costPrice`)
  }
})

test('per-item prices inside a deal never reach the public payload', () => {
  const publicMenu = toPublicMenu(menu)
  for (const inc of publicMenu.deals[0].includes) {
    assert.ok(!('unitPrice' in inc), 'deal include still carries unitPrice')
  }
})

test('everything a customer needs survives', () => {
  const publicMenu = toPublicMenu(menu)
  assert.deepEqual(publicMenu.items[0], {
    id: 'i-1', name: 'Zinger', category: 'burger', price: 200, size: 'large',
  })
  assert.equal(publicMenu.deals[0].name, 'Family Deal')
  assert.equal(publicMenu.deals[0].price, 1000)
  assert.deepEqual(publicMenu.deals[0].includes[0], { itemId: 'i-1', qty: 2 })
})

test('the original menu is not mutated', () => {
  toPublicMenu(menu)
  assert.equal(menu.items[0].costPrice, 120)
  assert.equal(menu.deals[0].includes[0].unitPrice, 180)
})

test('empty and missing input do not throw', () => {
  assert.deepEqual(toPublicMenu({}), { items: [], deals: [] })
  assert.deepEqual(toPublicMenu(undefined), { items: [], deals: [] })
})
