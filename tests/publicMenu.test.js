import test from 'node:test'
import assert from 'node:assert/strict'
import { toPublicMenu, toPublicPartnerMenu } from '../lib/publicMenu.js'

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
  assert.deepEqual(toPublicMenu({}), { categories: [], items: [], deals: [] })
  assert.deepEqual(toPublicMenu(undefined), { categories: [], items: [], deals: [] })
})

test('categories travel with the public menu', () => {
  // A customer-facing menu needs the café's own section names, icons and
  // colours — they say nothing about what anything costs the business.
  const withCategories = { ...menu, categories: [{ key: 'pizza', label: 'Pizzas', icon: '🍕', color: '#8a1f1f' }] }
  assert.deepEqual(toPublicMenu(withCategories).categories, [
    { key: 'pizza', label: 'Pizzas', icon: '🍕', color: '#8a1f1f' },
  ])
})

const partnerMenu = {
  items: [
    { id: 'i-1', name: 'Zinger', category: 'burger', price: 200, costPrice: 120, size: 'large' },
    { id: 'i-2', name: 'Cola', category: 'drinks', price: 80, costPrice: 30 },
    { id: 'i-3', name: 'Fries', category: 'fries', price: 150, costPrice: 40 },
  ],
  categories: [
    { key: 'burger', label: 'Burgers', icon: '🍔', color: '#c45c26' },
    { key: 'drinks', label: 'Cold drinks', icon: '🥤', color: '#1f7a3c' },
    { key: 'fries', label: 'Fries', icon: '🍟', color: '#b8860b' },
  ],
}
const kitchen = {
  id: 'br-ck', name: 'Claude Kitchen', slug: 'claude-kitchen', supplyDiscountPct: 20,
  prices: [
    { itemId: 'i-1', price: 260, visible: true },
    { itemId: 'i-2', price: 100, visible: false },
  ],
}

test('a partner’s public menu carries its own prices, and only what it sells', () => {
  const pub = toPublicPartnerMenu(partnerMenu, kitchen)
  assert.deepEqual(pub.items, [{ id: 'i-1', name: 'Zinger', category: 'burger', price: 260, size: 'large', description: null }])
  assert.deepEqual(pub.partner, { name: 'Claude Kitchen', slug: 'claude-kitchen' })
})

test('a partner’s public menu never shows the café’s price, cost or discount', () => {
  const text = JSON.stringify(toPublicPartnerMenu(partnerMenu, kitchen))
  assert.ok(!text.includes('costPrice'))
  assert.ok(!text.includes('supply'))
  assert.ok(!text.includes('"price":200'), 'the café’s own menu price leaked')
  assert.ok(!text.includes('br-ck'), 'the internal partner id leaked')
})

test('a partner’s public menu lists only the categories it uses', () => {
  assert.deepEqual(toPublicPartnerMenu(partnerMenu, kitchen).categories.map((c) => c.key), ['burger'])
})

test('a partner’s public menu shows the name it gave a café item, else the café’s', () => {
  const named = {
    ...kitchen,
    prices: [
      { itemId: 'i-1', price: 260, visible: true, displayName: 'Crispy Chicken Burger' },
      { itemId: 'i-3', price: 180, visible: true, displayName: null },
    ],
  }
  assert.deepEqual(toPublicPartnerMenu(partnerMenu, named).items.map((i) => i.name), ['Crispy Chicken Burger', 'Fries'])
})

test('a partner’s public menu carries each item’s description, null when it has none', () => {
  const described = {
    ...partnerMenu,
    items: partnerMenu.items.map((i) => (i.id === 'i-1' ? { ...i, description: 'A crispy fillet in a soft bun.' } : i)),
  }
  const withOwn = {
    ...kitchen,
    prices: [...kitchen.prices, { itemId: 'i-3', price: 180, visible: true }],
    ownItems: [{ id: 'pi-1', name: 'Karahi', category: 'Curries', price: 1200, visible: true }],
  }
  const byId = Object.fromEntries(toPublicPartnerMenu(described, withOwn).items.map((i) => [i.id, i.description]))
  assert.deepEqual(byId, { 'i-1': 'A crispy fillet in a soft bun.', 'i-3': null, 'pi-1': null })
})

test('a partner’s own description replaces the café’s on its public menu', () => {
  const described = {
    ...partnerMenu,
    items: partnerMenu.items.map((i) => ({ ...i, description: `Café words for ${i.name}` })),
  }
  const k = {
    ...kitchen,
    prices: [
      { itemId: 'i-1', price: 260, visible: true, description: 'Kitchen words' },
      { itemId: 'i-3', price: 180, visible: true, description: null },
    ],
    ownItems: [{ id: 'pi-1', name: 'Karahi', category: 'Curries', price: 1200, visible: true, description: 'Slow cooked' }],
  }
  const byId = Object.fromEntries(toPublicPartnerMenu(described, k).items.map((i) => [i.id, i.description]))
  assert.deepEqual(byId, { 'i-1': 'Kitchen words', 'i-3': 'Café words for Fries', 'pi-1': 'Slow cooked' })
})
