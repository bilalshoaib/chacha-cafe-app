import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOrderLine } from '../lib/orderLines.js'
import {
  parseSupplyDiscountPct,
  partnerSellableItems,
  partnerSettlement,
  supplyUnitPrice,
} from '../lib/partners.js'
import {
  calcInvoiceSplits,
  invoiceBusinessType,
  lineMatchesBusiness,
  matchesBusiness,
  normalizeReportBusiness,
} from '../lib/reports.js'

const partner = {
  id: 'br-ck',
  name: 'Claude Kitchen',
  slug: 'claude-kitchen',
  supplyDiscountPct: 20,
  prices: [
    { itemId: 'i1', price: 650, visible: true },
    { itemId: 'i2', price: 280, visible: false },
  ],
}

const menu = {
  items: [
    { id: 'i1', name: 'Zinger', category: 'burger', price: 500 },
    { id: 'i2', name: 'Latte', category: 'coffee', price: 300, businessType: 'cafe' },
    { id: 'i3', name: 'Fries', category: 'fries', price: 200 },
  ],
  deals: [{ id: 'd1', name: 'Meal', price: 700, includes: [{ itemId: 'i1', qty: 1 }], status: 'active' }],
  partners: [partner],
}

test('the café is owed its menu price less the discount', () => {
  assert.equal(supplyUnitPrice(500, 20), 400)
  assert.equal(supplyUnitPrice(333, 12.5), 291.38)
  assert.equal(supplyUnitPrice(500, 0), 500)
})

test('a discount outside 0–100 is refused, and blank means none', () => {
  assert.ok(parseSupplyDiscountPct(120).error)
  assert.ok(parseSupplyDiscountPct(-1).error)
  assert.ok(parseSupplyDiscountPct('abc').error)
  assert.equal(parseSupplyDiscountPct('').value, 0)
  assert.equal(parseSupplyDiscountPct('20').value, 20)
})

test('a partner line is priced from the partner list, and carries what the café is owed', () => {
  const { line } = buildOrderLine({ kind: 'item', refId: 'i1', qty: 2 }, menu, { partner })
  assert.equal(line.unitPrice, 650)
  assert.equal(line.lineTotal, 1300)
  assert.equal(line.lineBusinessType, 'claude-kitchen')
  assert.equal(line.supplyUnitPrice, 400)
  assert.equal(line.supplyTotal, 800)
})

test('a discount the cashier gives comes off the partner, not the café', () => {
  const { line } = buildOrderLine({ kind: 'item', refId: 'i1', qty: 1, lineDiscount: 100 }, menu, { partner })
  assert.equal(line.lineTotal, 550)
  assert.equal(line.supplyTotal, 400)
})

test('an item the partner does not sell, or has hidden, is refused for a new sale', () => {
  assert.equal(buildOrderLine({ kind: 'item', refId: 'i3', qty: 1 }, menu, { partner }).status, 400)
  assert.equal(buildOrderLine({ kind: 'item', refId: 'i2', qty: 1 }, menu, { partner }).status, 400)
})

test('a hidden item still prices when an old invoice holding it is edited', () => {
  const { line } = buildOrderLine({ kind: 'item', refId: 'i2', qty: 1 }, menu, { partner, allowArchived: true })
  assert.equal(line.unitPrice, 280)
  assert.equal(line.supplyTotal, 240)
})

test('a partner cannot sell the café’s deals', () => {
  assert.equal(buildOrderLine({ kind: 'deal', refId: 'd1', qty: 1 }, menu, { partner }).status, 400)
})

test('without a partner, a line is priced as it always was', () => {
  const { line } = buildOrderLine({ kind: 'item', refId: 'i1', qty: 1 }, menu)
  assert.equal(line.unitPrice, 500)
  assert.equal(line.supplyTotal, undefined)
})

test('the partner till shows only visible items, at the partner price', () => {
  const items = partnerSellableItems(menu, partner)
  assert.deepEqual(items.map((i) => [i.id, i.price]), [['i1', 650]])
})

function partnerInvoice(lines, extra = {}) {
  return { businessType: 'claude-kitchen', brandId: 'br-ck', lines, total: lines.reduce((s, l) => s + l.lineTotal, 0), ...extra }
}

test('settlement: the café keeps the supply price and owes the partner the rest', () => {
  const a = buildOrderLine({ kind: 'item', refId: 'i1', qty: 3 }, menu, { partner }).line
  const s = partnerSettlement([partnerInvoice([a])])
  assert.equal(s.invoiceCount, 1)
  assert.equal(s.units, 3)
  assert.equal(s.sales, 1950)
  assert.equal(s.cafeShare, 1200)
  assert.equal(s.payable, 750)
  assert.equal(s.items[0].payable, 750)
})

test('settlement leaves out returned sales', () => {
  const a = buildOrderLine({ kind: 'item', refId: 'i1', qty: 1 }, menu, { partner }).line
  const s = partnerSettlement([partnerInvoice([a], { returned: true })])
  assert.equal(s.invoiceCount, 0)
  assert.equal(s.payable, 0)
})

test('selling below the supply price leaves the partner owing the café', () => {
  const cheap = { ...partner, prices: [{ itemId: 'i1', price: 300, visible: true }] }
  const a = buildOrderLine({ kind: 'item', refId: 'i1', qty: 1 }, menu, { partner: cheap }).line
  assert.equal(partnerSettlement([partnerInvoice([a])]).payable, -100)
})

test('inclusive tax reaches neither side of the settlement', () => {
  const a = buildOrderLine({ kind: 'item', refId: 'i1', qty: 1 }, menu, { partner }).line
  const s = partnerSettlement([partnerInvoice([a], { taxInclusive: true, taxTotal: 50 })])
  assert.equal(s.sales, 600)
  assert.equal(s.payable, 200)
})

test('a partner sale is its own business in the reports, never the café’s', () => {
  const inv = partnerInvoice([])
  assert.equal(invoiceBusinessType(inv), 'claude-kitchen')
  assert.equal(matchesBusiness('claude-kitchen', 'cafe'), false)
  assert.equal(matchesBusiness('claude-kitchen', 'claude-kitchen'), true)
  assert.equal(lineMatchesBusiness({ lineBusinessType: 'claude-kitchen' }, 'claude-kitchen', 'burger'), false)
})

test('legacy business types still read as before', () => {
  assert.equal(invoiceBusinessType({ businessType: 'Chacha Cafe' }), 'cafe')
  assert.equal(invoiceBusinessType({ businessType: null }), 'cafe')
  assert.equal(invoiceBusinessType({ businessType: 'combined' }), 'combined')
})

test('the report filter accepts a partner slug, and nothing that is not a slug', () => {
  assert.equal(normalizeReportBusiness('claude-kitchen'), 'claude-kitchen')
  assert.equal(normalizeReportBusiness('burger'), 'burger')
  assert.equal(normalizeReportBusiness("x' OR 1=1"), null)
  assert.equal(normalizeReportBusiness(''), null)
})

test('a partner sale is credited to the partner’s own column', () => {
  const brands = [{ slug: 'cafe' }, { slug: 'burger' }, { slug: 'claude-kitchen' }]
  const a = buildOrderLine({ kind: 'item', refId: 'i1', qty: 1 }, menu, { partner }).line
  const splits = calcInvoiceSplits(partnerInvoice([a]), brands)
  assert.equal(splits.get('claude-kitchen'), 650)
  assert.equal(splits.get('cafe'), 0)
})

// ── Own items ───────────────────────────────────────────────────────────────

{
  const { test } = await import('node:test')
  const assert = (await import('node:assert/strict')).default
  const { buildOrderLine } = await import('../lib/orderLines.js')
  const { toPublicPartnerMenu } = await import('../lib/publicMenu.js')
  const { partnerSellableItems: sellable, partnerSettlement: settle } = await import('../lib/partners.js')

  const kitchen = {
    id: 'br-k',
    name: 'Kitchen',
    slug: 'kitchen',
    supplyDiscountPct: 20,
    prices: [{ itemId: 'it-1', price: 500, visible: true }],
    ownItems: [
      { id: 'pi-1', name: 'Karahi', category: 'Curries', price: 1200, visible: true },
      { id: 'pi-2', name: 'Off today', category: 'Curries', price: 300, visible: false },
    ],
  }
  const cafeMenu = {
    items: [{ id: 'it-1', name: 'Burger', category: 'burgers', price: 400, cost: 150 }],
    categories: [{ key: 'burgers', label: 'Burgers', icon: '🍔', color: '#f00' }],
    partners: [kitchen],
  }

  test('a partner sells its own visible items beside the café’s', () => {
    const names = sellable(cafeMenu, kitchen).map((i) => i.name)
    assert.deepEqual(names, ['Burger', 'Karahi'])
  })

  test('an own item owes the café nothing', () => {
    const { line } = buildOrderLine({ kind: 'item', refId: 'pi-1', qty: 2 }, cafeMenu, { partner: kitchen })
    assert.equal(line.lineTotal, 2400)
    assert.equal(line.supplyUnitPrice, 0)
    assert.equal(line.supplyTotal, 0)
    assert.equal(line.lineBusinessType, 'kitchen')
  })

  test('a hidden own item cannot be sold, but an old bill holding it can be edited', () => {
    const { error } = buildOrderLine({ kind: 'item', refId: 'pi-2', qty: 1 }, cafeMenu, { partner: kitchen })
    assert.ok(error)
    const { line } = buildOrderLine({ kind: 'item', refId: 'pi-2', qty: 1 }, cafeMenu, { partner: kitchen, allowArchived: true })
    assert.equal(line.lineTotal, 300)
  })

  test('the café cannot sell a partner’s own item', () => {
    const { error } = buildOrderLine({ kind: 'item', refId: 'pi-1', qty: 1 }, cafeMenu)
    assert.ok(error)
  })

  test('own items settle wholly to the partner', () => {
    const burger = buildOrderLine({ kind: 'item', refId: 'it-1', qty: 1 }, cafeMenu, { partner: kitchen }).line
    const karahi = buildOrderLine({ kind: 'item', refId: 'pi-1', qty: 1 }, cafeMenu, { partner: kitchen }).line
    const s = settle([{ lines: [burger, karahi] }])
    assert.equal(s.sales, 1700)
    assert.equal(s.cafeShare, 320)
    assert.equal(s.payable, 1380)
  })

  test('the public menu lists own items and their own category', () => {
    const out = toPublicPartnerMenu(cafeMenu, kitchen)
    assert.deepEqual(out.items.map((i) => i.id), ['it-1', 'pi-1'])
    assert.deepEqual(out.categories.map((c) => c.key), ['burgers', 'Curries'])
    assert.equal(JSON.stringify(out).includes('cost'), false)
  })
}
