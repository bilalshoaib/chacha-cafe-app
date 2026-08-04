import test from 'node:test'
import assert from 'node:assert/strict'
import { shiftDateForInstant } from '../lib/shift.js'

// A shift opens at 6 PM Asia/Karachi (UTC+5) and runs to the next 6 PM, so
// everything sold after midnight still belongs to the evening it started in.

test('an order just after 6 PM opens that evening’s shift', () => {
  // 13:30 UTC = 18:30 Karachi
  assert.equal(shiftDateForInstant(new Date('2026-08-03T13:30:00Z')), '2026-08-03')
})

test('an order after midnight still belongs to the previous evening', () => {
  // 20:00 UTC = 01:00 Karachi on the 4th — but the shift opened on the 3rd
  assert.equal(shiftDateForInstant(new Date('2026-08-03T20:00:00Z')), '2026-08-03')
})

test('an afternoon order still belongs to yesterday’s shift', () => {
  // 10:00 UTC = 15:00 Karachi, before tonight's 6 PM open
  assert.equal(shiftDateForInstant(new Date('2026-08-03T10:00:00Z')), '2026-08-02')
})

test('6 PM exactly starts the new shift', () => {
  // 13:00 UTC = 18:00 Karachi
  assert.equal(shiftDateForInstant(new Date('2026-08-03T13:00:00Z')), '2026-08-03')
})

test('one minute before 6 PM is still the old shift', () => {
  // 12:59 UTC = 17:59 Karachi
  assert.equal(shiftDateForInstant(new Date('2026-08-03T12:59:00Z')), '2026-08-02')
})

test('a shift spanning a month boundary rolls back correctly', () => {
  // 02:00 Karachi on 1 Sep belongs to the shift opened 31 Aug
  assert.equal(shiftDateForInstant(new Date('2026-08-31T21:00:00Z')), '2026-08-31')
})

test('a shift spanning a year boundary rolls back correctly', () => {
  // 02:00 Karachi on 1 Jan 2027 belongs to the shift opened 31 Dec 2026
  assert.equal(shiftDateForInstant(new Date('2026-12-31T21:00:00Z')), '2026-12-31')
})
