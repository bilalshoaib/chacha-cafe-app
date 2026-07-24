const SHIFT_TIMEZONE = 'Asia/Karachi'
const SHIFT_START_HOUR = 18 // 6 PM

function karachiParts(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHIFT_TIMEZONE,
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
 * date (Asia/Karachi) of the most recent 6 PM at or before that moment. A new
 * shift — and a fresh order-number sequence — starts at 6 PM every day.
 */
export function shiftDateForInstant(date = new Date()) {
  const { year, month, day, hour } = karachiParts(date)
  const shiftDay = new Date(Date.UTC(year, month - 1, day))
  if (hour < SHIFT_START_HOUR) shiftDay.setUTCDate(shiftDay.getUTCDate() - 1)
  return shiftDay.toISOString().slice(0, 10)
}
