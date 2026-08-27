import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseHour,
  tradingDay,
  formatHour,
  tradingDayLabel,
  tradingDayShortLabel,
  spansMidnight,
  tradingDayRange,
  currentTradingDay,
  DEFAULT_DAY_START_HOUR,
  DEFAULT_DAY_END_HOUR,
} from '../lib/tradingDay.js'
import { shiftDateForInstant } from '../lib/shift.js'

test('an hour is a whole number of the clock, and nothing else is', () => {
  assert.equal(parseHour(0), 0)
  assert.equal(parseHour('7'), 7)
  assert.equal(parseHour(23), 23)
  assert.equal(parseHour(24), null)
  assert.equal(parseHour(-1), null)
  assert.equal(parseHour(6.5), null)
  assert.equal(parseHour('breakfast'), null)
  assert.equal(parseHour(null), null)
})

test('a café with no hours of its own trades on the platform default', () => {
  assert.deepEqual(tradingDay(null), {
    startHour: DEFAULT_DAY_START_HOUR,
    endHour: DEFAULT_DAY_END_HOUR,
  })
})

test('an hour set to midnight is kept, not mistaken for unset', () => {
  // 0 is falsy, and a ?? / || slip here would silently move a 24-hour café's
  // day to 6 PM.
  assert.deepEqual(tradingDay({ dayStartHour: 0, dayEndHour: 0 }), { startHour: 0, endHour: 0 })
})

test('one hour set and the other missing falls back only for the missing one', () => {
  assert.deepEqual(tradingDay({ dayStartHour: 7 }), { startHour: 7, endHour: DEFAULT_DAY_END_HOUR })
})

test('hours are read whether they are named for the column or for the rule', () => {
  // The column spelling and the resolved spelling both have to work: helpers
  // pass their own output back in, and the console hands over a draft.
  assert.deepEqual(tradingDay({ startHour: 7, endHour: 15 }), { startHour: 7, endHour: 15 })
  assert.deepEqual(tradingDay({ dayStartHour: 7, dayEndHour: 15 }), { startHour: 7, endHour: 15 })
})

test('hours are named the way somebody would say them', () => {
  assert.equal(formatHour(0), 'midnight')
  assert.equal(formatHour(7), '7 AM')
  assert.equal(formatHour(12), 'noon')
  assert.equal(formatHour(17), '5 PM')
  assert.equal(formatHour(18), '6 PM')
})

test('a day that closes before it opens is a day that ends tomorrow', () => {
  assert.equal(tradingDayLabel({ dayStartHour: 18, dayEndHour: 17 }), '6 PM – 5 PM the next day')
  assert.equal(spansMidnight({ dayStartHour: 18, dayEndHour: 17 }), true)
})

test('a day inside one calendar date does not claim to end tomorrow', () => {
  assert.equal(tradingDayLabel({ dayStartHour: 7, dayEndHour: 23 }), '7 AM – 11 PM')
  assert.equal(spansMidnight({ dayStartHour: 7, dayEndHour: 23 }), false)
})

test('equal hours read as a café that never closes', () => {
  assert.match(tradingDayLabel({ dayStartHour: 0, dayEndHour: 0 }), /24 hours/)
  assert.equal(spansMidnight({ dayStartHour: 0, dayEndHour: 0 }), true)
})

test('the short label is what fits on a button', () => {
  assert.equal(tradingDayShortLabel({ dayStartHour: 18, dayEndHour: 17 }), '6 PM–5 PM')
  assert.equal(tradingDayShortLabel({ dayStartHour: 7, dayEndHour: 15 }), '7 AM–3 PM')
})

test('a night shift’s range ends on the following calendar day', () => {
  const [from, to] = tradingDayRange(0, { dayStartHour: 18, dayEndHour: 17 }, new Date(2026, 7, 3, 20))
  const start = new Date(from)
  const end = new Date(to)
  assert.equal(start.getDate(), 3)
  assert.equal(start.getHours(), 18)
  assert.equal(end.getDate(), 4)
  assert.equal(end.getHours(), 17)
})

test('a daytime café’s range opens and closes on the same date', () => {
  const [from, to] = tradingDayRange(0, { dayStartHour: 7, dayEndHour: 15 }, new Date(2026, 7, 3, 9))
  assert.equal(new Date(from).getDate(), 3)
  assert.equal(new Date(to).getDate(), 3)
  assert.equal(new Date(to).getHours(), 15)
})

test('stepping the range back a day crosses a month end cleanly', () => {
  const [from] = tradingDayRange(-1, { dayStartHour: 18, dayEndHour: 17 }, new Date(2026, 8, 1, 20))
  assert.equal(new Date(from).getMonth(), 7) // August
  assert.equal(new Date(from).getDate(), 31)
})

test('before opening, the day in progress is still yesterday’s', () => {
  // 3 PM for a café that opens at 6 PM: the day that is running opened
  // yesterday evening and has not closed yet.
  const day = currentTradingDay({ dayStartHour: 18, dayEndHour: 17 }, new Date(2026, 7, 4, 15))
  assert.equal(day.getDate(), 3)
  assert.equal(day.getHours(), 18)
})

test('after opening, the day in progress is today’s', () => {
  const day = currentTradingDay({ dayStartHour: 18, dayEndHour: 17 }, new Date(2026, 7, 4, 19))
  assert.equal(day.getDate(), 4)
})

// The till side of the same setting: which day an invoice is stamped with.
// These are the cases that were wrong for every café that was not Chacha.

test('a breakfast café’s morning sale counts towards that morning', () => {
  // 03:00 UTC = 08:00 Karachi, for a café whose day opens at 7 AM.
  assert.equal(
    shiftDateForInstant(new Date('2026-08-04T03:00:00Z'), { shiftStartHour: 7 }),
    '2026-08-04',
  )
  // The same instant, on the old hardcoded 6 PM boundary, was counted against
  // the day before — which is the bug this setting exists to fix.
  assert.equal(shiftDateForInstant(new Date('2026-08-04T03:00:00Z')), '2026-08-03')
})

test('a café that opens at midnight counts by the calendar date', () => {
  // 19:00 UTC = 00:00 Karachi on the 4th.
  assert.equal(
    shiftDateForInstant(new Date('2026-08-03T19:00:00Z'), { shiftStartHour: 0 }),
    '2026-08-04',
  )
})
