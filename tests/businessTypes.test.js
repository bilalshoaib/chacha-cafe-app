import test from 'node:test'
import assert from 'node:assert/strict'
import { invoiceBusinessTypeForLines } from '../lib/businessTypes.js'

const line = (lineBusinessType) => ({ lineBusinessType })

test('an order of only cafe items is a cafe invoice', () => {
  assert.equal(invoiceBusinessTypeForLines([line('cafe'), line('cafe')]), 'cafe')
})

test('an order of only burger items is a burger invoice', () => {
  assert.equal(invoiceBusinessTypeForLines([line('burger')]), 'burger')
})

test('a genuine mix of both businesses is combined', () => {
  assert.equal(invoiceBusinessTypeForLines([line('cafe'), line('burger')]), 'combined')
})

test('a combined deal makes the whole invoice combined', () => {
  assert.equal(invoiceBusinessTypeForLines([line('cafe'), line('combined')]), 'combined')
})

test('shared "both" items do not make an invoice combined on their own', () => {
  // A cola is sold at either counter. An order of colas and a shawarma is a
  // cafe order, not a cross-business one.
  assert.equal(invoiceBusinessTypeForLines([line('both'), line('cafe')]), 'cafe')
  assert.equal(invoiceBusinessTypeForLines([line('both'), line('burger')]), 'burger')
})

test('an order of nothing but shared items falls back to cafe', () => {
  assert.equal(invoiceBusinessTypeForLines([line('both'), line('both')]), 'cafe')
})

test('empty and missing input do not throw', () => {
  assert.equal(invoiceBusinessTypeForLines([]), 'cafe')
  assert.equal(invoiceBusinessTypeForLines(undefined), 'cafe')
})

test('lines with no business type recorded are ignored', () => {
  assert.equal(invoiceBusinessTypeForLines([{}, line('burger')]), 'burger')
})
