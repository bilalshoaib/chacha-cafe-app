// Defaults, not decisions. Each location carries its own timezone and the
// hour its trading day rolls over — a breakfast café closes long before six.
// These keep the existing single-location behaviour identical.
const DEFAULT_TIMEZONE = 'Asia/Karachi'
const DEFAULT_SHIFT_START_HOUR = 18 // 6 PM

function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  const hour = Number(parts.hour) % 24 // some environments render midnight as "24"
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour }
}

/**
 * Returns the YYYY-MM-DD "shift date" a given moment belongs to: the calendar
 * date, in the location's timezone, of the most recent shift start at or
 * before that moment. A new shift — and a fresh order-number sequence —
 * begins at that hour every day.
 */
export function shiftDateForInstant(
  date = new Date(),
  { timezone = DEFAULT_TIMEZONE, shiftStartHour = DEFAULT_SHIFT_START_HOUR } = {},
) {
  const { year, month, day, hour } = zonedParts(date, timezone)
  const shiftDay = new Date(Date.UTC(year, month - 1, day))
  if (hour < shiftStartHour) shiftDay.setUTCDate(shiftDay.getUTCDate() - 1)
  return shiftDay.toISOString().slice(0, 10)
}
