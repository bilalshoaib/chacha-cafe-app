import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_TABLE_NUMBER, normalizeTableNumber, tableNumberForOrderType } from '../lib/tableNumber.js'

test('a table number is trimmed, and blank means no table', () => {
  assert.equal(normalizeTableNumber('4'), '4')
  assert.equal(normalizeTableNumber('  12A  '), '12A')
  assert.equal(normalizeTableNumber(''), null)
  assert.equal(normalizeTableNumber('   '), null)
  assert.equal(normalizeTableNumber(null), null)
  assert.equal(normalizeTableNumber(undefined), null)
})

test('inner whitespace is collapsed so one table is one string', () => {
  // The invoice search compares the stored text, so "Patio  3" and "Patio 3"
  // have to be the same table or one of them is unfindable.
  assert.equal(normalizeTableNumber('Patio   3'), 'Patio 3')
  assert.equal(normalizeTableNumber('Bar\t2'), 'Bar 2')
})

test('case is kept, because a receipt prints what was typed', () => {
  assert.equal(normalizeTableNumber('Patio 3'), 'Patio 3')
  assert.equal(normalizeTableNumber('t4'), 't4')
})

test('a table number is cut to the width of the column', () => {
  const long = 'x'.repeat(MAX_TABLE_NUMBER + 15)
  assert.equal(normalizeTableNumber(long).length, MAX_TABLE_NUMBER)
})

test('a number is accepted as readily as a string', () => {
  assert.equal(normalizeTableNumber(7), '7')
})

test('a delivery has no table, whatever was sent with it', () => {
  assert.equal(tableNumberForOrderType('4', 'delivery'), null)
  assert.equal(tableNumberForOrderType('Patio 3', 'delivery'), null)
})

test('dine-in and takeaway both keep their table', () => {
  assert.equal(tableNumberForOrderType('4', 'dine_in'), '4')
  // Counter service hands out a number and runs the food out to it.
  assert.equal(tableNumberForOrderType('4', 'takeaway'), '4')
  // An invoice with no order type at all — the older rows — is not a delivery.
  assert.equal(tableNumberForOrderType('4', null), '4')
})
