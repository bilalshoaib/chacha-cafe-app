import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TIMEZONES, TIMEZONE_REGIONS, DEFAULT_TIMEZONE,
  isTimezone, parseTimezone, timezoneInfo, currentTimeIn,
} from '../constants/timezones.js'
import { shiftDateForInstant } from '../lib/shift.js'
import { tradingDay } from '../lib/tradingDay.js'

// ── The list ────────────────────────────────────────────────────────────────

test('every offered timezone is one Intl can actually resolve', () => {
  // The picker writes these straight to the database, so a typo here would be
  // a café whose day boundary silently falls back to Karachi's.
  for (const z of TIMEZONES) {
    assert.ok(isTimezone(z.id), `${z.id} is not a zone Intl knows`)
  }
})

test('no timezone is listed twice', () => {
  const ids = TIMEZONES.map((z) => z.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('the default is on the list', () => {
  assert.ok(TIMEZONES.some((z) => z.id === DEFAULT_TIMEZONE))
})

test('every zone has a region, and the regions cover the list', () => {
  for (const z of TIMEZONES) assert.ok(z.region, `${z.id} has no region`)
  assert.deepEqual(
    new Set(TIMEZONE_REGIONS),
    new Set(TIMEZONES.map((z) => z.region)),
  )
})

test('the six US zones the currency could never have supplied are all offered', () => {
  // This is the reason the field exists at all: en-US spans these, so no
  // amount of currency-derived cleverness distinguishes them.
  for (const id of [
    'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage',
  ]) {
    assert.ok(TIMEZONES.some((z) => z.id === id), `${id} missing`)
  }
})

// ── Validation, asymmetric on purpose ───────────────────────────────────────

test('a bad zone is refused on the way in', () => {
  for (const bad of ['', '   ', 'Mars/Olympus', 'GMT+5', null, undefined, 42, {}]) {
    assert.equal(isTimezone(bad), false, `${JSON.stringify(bad)} should be refused`)
  }
})

test('a zone that is legal but not on the list is still accepted', () => {
  // The curated list is what the picker offers, not the limit of what is
  // legal — a café somewhere nobody thought to add should not be refused.
  assert.ok(isTimezone('Europe/Malta'))
  assert.ok(isTimezone('UTC'))
})

test('a bad zone falls back rather than throwing on the way out', () => {
  // A till that crashes is worse than one showing the wrong day boundary.
  assert.equal(parseTimezone('Mars/Olympus'), DEFAULT_TIMEZONE)
  assert.equal(parseTimezone(null), DEFAULT_TIMEZONE)
  assert.equal(parseTimezone('America/Chicago'), 'America/Chicago')
})

test('an unlisted zone still gets a usable label', () => {
  const info = timezoneInfo('Europe/Malta')
  assert.equal(info.id, 'Europe/Malta')
  assert.equal(info.city, 'Malta')
})

test('an underscored IANA name reads as a city', () => {
  assert.equal(timezoneInfo('America/Los_Angeles').city, 'Los Angeles')
})

test('the clock renders as HH:MM and never throws', () => {
  assert.match(currentTimeIn('America/Chicago'), /^\d{2}:\d{2}$/)
  assert.equal(currentTimeIn('Mars/Olympus'), '')
})

// ── What it is actually for: which day a sale counts against ────────────────

test('the same instant falls on different trading days in different zones', () => {
  // The bug this fixes, in one assertion. 14:00 UTC is 9 AM in Chicago — before
  // a 6 PM opening, so still yesterday's trading day — and 7 PM in Karachi,
  // which is after it, so today's. A full day apart for the same sale.
  //
  // Every US café was being answered on the Karachi line, so an American
  // morning's takings were filed against the wrong day.
  const instant = new Date('2026-08-04T14:00:00Z')
  assert.equal(
    shiftDateForInstant(instant, { shiftStartHour: 18, timezone: 'America/Chicago' }),
    '2026-08-03',
  )
  assert.equal(
    shiftDateForInstant(instant, { shiftStartHour: 18, timezone: 'Asia/Karachi' }),
    '2026-08-04',
  )
})

test('a Chicago café’s late evening counts against the day it started in', () => {
  // 03:00 UTC on the 4th is 10 PM on the 3rd in Chicago. A café whose day
  // opens at 6 PM is mid-service, so this belongs to the 3rd. Answered on
  // Karachi's clock it is 8 AM on the 4th — before that day's 6 PM opening —
  // and would be filed against the 3rd too, but for the wrong reason and with
  // the boundary in the wrong place either side of it.
  const lateEvening = new Date('2026-08-04T03:00:00Z')
  assert.equal(
    shiftDateForInstant(lateEvening, { shiftStartHour: 18, timezone: 'America/Chicago' }),
    '2026-08-03',
  )
})

test('the boundary itself lands where the café is, not where the server thinks', () => {
  // 23:00 UTC on the 3rd is 6 PM in Chicago exactly — the instant the new
  // trading day opens there, so this sale is the first of the 3rd's evening.
  const opening = new Date('2026-08-03T23:00:00Z')
  assert.equal(
    shiftDateForInstant(opening, { shiftStartHour: 18, timezone: 'America/Chicago' }),
    '2026-08-03',
  )
  // One minute earlier is still the previous trading day.
  assert.equal(
    shiftDateForInstant(new Date('2026-08-03T22:59:00Z'), { shiftStartHour: 18, timezone: 'America/Chicago' }),
    '2026-08-02',
  )
})

test('an existing Karachi café is answered exactly as before', () => {
  // The whole safety argument for reading the column: every row already holds
  // Asia/Karachi, so passing it explicitly must not move a single sale.
  for (const iso of [
    '2026-08-03T13:30:00Z', '2026-08-03T20:00:00Z', '2026-08-03T10:00:00Z',
    '2026-08-31T21:00:00Z', '2026-12-31T21:00:00Z',
  ]) {
    const d = new Date(iso)
    assert.equal(
      shiftDateForInstant(d, { shiftStartHour: 18, timezone: 'Asia/Karachi' }),
      shiftDateForInstant(d, { shiftStartHour: 18 }),
      `${iso} moved`,
    )
  }
})

// ── Carrying it through the trading-day helper ──────────────────────────────

test('tradingDay carries a timezone through when it is given one', () => {
  const hours = tradingDay({ dayStartHour: 7, dayEndHour: 22, timezone: 'America/Denver' })
  assert.equal(hours.startHour, 7)
  assert.equal(hours.endHour, 22)
  assert.equal(hours.timezone, 'America/Denver')
})

test('tradingDay leaves the timezone absent rather than inventing one', () => {
  // lib/shift.js owns the default. A second module deciding it is a second
  // place that can disagree.
  const hours = tradingDay({ dayStartHour: 7 })
  assert.equal('timezone' in hours, false)
})
