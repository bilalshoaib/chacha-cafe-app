/**
 * When a café's day begins and ends.
 *
 * Two numbers, and until now both were constants: 18 in lib/shift.js, and 18
 * and 17 again in the reports screen. They decide three things a café would
 * notice — which day a sale is counted against, when the short order numbers
 * reset, and what "today" means on the reports screen — so having them written
 * in two files as literals meant a café whose hours differed had all three
 * quietly wrong and no way to say so.
 *
 * Pure, like tenantAccess.js next door, and for the same reason: it is
 * imported by the server that stamps an invoice and by the client that draws
 * the date range, and neither wants a database import to come with it.
 */

/** Chacha's hours, and so the platform's default: 6 PM to 5 PM the next day. */
export const DEFAULT_DAY_START_HOUR = 18
export const DEFAULT_DAY_END_HOUR = 17

/**
 * An hour of the clock, or null for anything that is not one.
 *
 * Only a number or a string of digits counts. Number(null) and Number('') are
 * both 0, and midnight is a legitimate opening hour — so waving those through
 * would silently set a café's day to start at midnight when what actually
 * happened was that the field was empty.
 */
export function parseHour(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < 0 || n > 23) return null
  return n
}

/**
 * The hours in force for a café, whatever shape its row arrives in.
 *
 * Two spellings are accepted, deliberately. `dayStartHour`/`dayEndHour` is how
 * the column, the API and the console's draft name them; `startHour`/`endHour`
 * is what this module hands back, and what the helpers below pass to each
 * other. Taking both means a resolved pair can be fed back in without being
 * translated first — a mismatch that had tradingDayRange() silently reading
 * the defaults instead of the café's own hours.
 *
 * Falls back to the default per hour rather than as a pair, so a row that has
 * only ever had one of them set is still answered sensibly.
 */
export function tradingDay(tenant) {
  const start = parseHour(tenant?.dayStartHour ?? tenant?.startHour)
  const end = parseHour(tenant?.dayEndHour ?? tenant?.endHour)
  return {
    startHour: start == null ? DEFAULT_DAY_START_HOUR : start,
    endHour: end == null ? DEFAULT_DAY_END_HOUR : end,
    // Carried through rather than resolved here, because an hour without the
    // zone it is counted in is only two thirds of an answer: 6 PM in Karachi
    // and 6 PM in Chicago are eleven hours apart, and which of them a sale
    // falls before decides which day it is counted against. Left undefined
    // when the caller did not supply one, so lib/shift.js applies its own
    // default rather than this module inventing a second place that decides.
    ...(tenant?.timezone ? { timezone: tenant.timezone } : {}),
  }
}

/** "6 PM", "5 PM", "midnight", "noon" — an hour as somebody would say it. */
export function formatHour(hour) {
  const h = parseHour(hour)
  if (h == null) return ''
  if (h === 0) return 'midnight'
  if (h === 12) return 'noon'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

/**
 * The whole day in one phrase: "6 PM – 5 PM the next day".
 *
 * A café that closes later in the day than it opens trades inside one calendar
 * date — 7 AM to 11 PM — and saying "the next day" there would be wrong. Equal
 * hours are a café that never closes.
 */
export function tradingDayLabel(hours) {
  const { startHour, endHour } = tradingDay(hours)
  if (startHour === endHour) return `${formatHour(startHour)} – ${formatHour(endHour)} the next day (24 hours)`
  if (endHour > startHour) return `${formatHour(startHour)} – ${formatHour(endHour)}`
  return `${formatHour(startHour)} – ${formatHour(endHour)} the next day`
}

/** The same phrase, tightened for a button: "6 PM–5 PM". */
export function tradingDayShortLabel(hours) {
  const { startHour, endHour } = tradingDay(hours)
  return `${formatHour(startHour)}–${formatHour(endHour)}`
}

/** True when the day closes on the calendar date after it opens. */
export function spansMidnight(hours) {
  const { startHour, endHour } = tradingDay(hours)
  return endHour <= startHour
}

/**
 * One trading day as a pair of ISO instants, in the reader's own timezone.
 *
 * `dayOffset` picks which: 0 is the day that opens this evening, -1 the one
 * that opened yesterday. The end is derived from the start rather than from
 * `now`, so it stays exactly one day later across month, year and DST
 * boundaries.
 */
export function tradingDayRange(dayOffset, hours, now = new Date()) {
  const { startHour, endHour } = tradingDay(hours)
  const start = new Date(now)
  start.setDate(start.getDate() + dayOffset)
  start.setHours(startHour, 0, 0, 0)
  const end = new Date(start)
  if (spansMidnight({ startHour, endHour })) end.setDate(end.getDate() + 1)
  end.setHours(endHour, 0, 0, 0)
  return [start.toISOString(), end.toISOString()]
}

/**
 * The trading day in progress at `now` — which is not the calendar date for
 * most of a night shift. Returned as a Date at that day's opening hour, for
 * callers that then want to know its month or step away from it.
 */
export function currentTradingDay(hours, now = new Date()) {
  const { startHour } = tradingDay(hours)
  const day = new Date(now)
  if (day.getHours() < startHour) day.setDate(day.getDate() - 1)
  day.setHours(startHour, 0, 0, 0)
  return day
}
