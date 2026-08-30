/**
 * The timezones a café can be in, and what happens when nothing has been
 * chosen.
 *
 * Timezone lives on the location row alongside the currency, for the same
 * reason: the branch is the thing that has a till, and a till is in exactly
 * one place. This file is only the list of what may be chosen — no database,
 * no React, importable from a route handler and a client component alike.
 *
 * **The currency cannot supply this one.** That is the whole reason it is a
 * separate choice rather than another thing `localeForCurrency` derives. A
 * café in Karachi and one in Lahore share `en-PK` and share a timezone, so
 * deriving would have worked for the original customer and gone unnoticed —
 * but `en-US` spans six, and a café in New York and one in Los Angeles do not
 * close on the same instant. The currency says how to write a number; only the
 * timezone says when the day ends.
 *
 * The default is Pakistan because that is what every existing row holds and
 * what `lib/shift.js` assumed before any of this was read.
 */

export const DEFAULT_TIMEZONE = 'Asia/Karachi'

/**
 * The timezones offered in the picker.
 *
 * Not the full IANA database — a list of 400 is a worse answer than a list of
 * 40 for somebody setting up one café who knows what city they are in. `id` is
 * the IANA name and is what is stored; `city` is what a person recognises;
 * `region` groups the list so it can be scanned rather than read.
 *
 * No UTC offsets are stored here. They change twice a year in half these
 * zones, and a number written down in this file would be wrong for six months
 * of it — `Intl` knows the current offset for every one of these and is asked
 * at the moment it is needed. That is also why the picker shows the live local
 * time rather than a label: it is the one thing that cannot go stale.
 *
 * Adding a market is one line.
 */
export const TIMEZONES = [
  // United States and Canada — the six the American demos need, which is the
  // case the currency's locale could never have covered.
  { id: 'America/New_York',    city: 'New York',      region: 'United States & Canada' },
  { id: 'America/Detroit',     city: 'Detroit',       region: 'United States & Canada' },
  { id: 'America/Chicago',     city: 'Chicago',       region: 'United States & Canada' },
  { id: 'America/Denver',      city: 'Denver',        region: 'United States & Canada' },
  { id: 'America/Phoenix',     city: 'Phoenix',       region: 'United States & Canada' },
  { id: 'America/Los_Angeles', city: 'Los Angeles',   region: 'United States & Canada' },
  { id: 'America/Anchorage',   city: 'Anchorage',     region: 'United States & Canada' },
  { id: 'Pacific/Honolulu',    city: 'Honolulu',      region: 'United States & Canada' },
  { id: 'America/Toronto',     city: 'Toronto',       region: 'United States & Canada' },
  { id: 'America/Vancouver',   city: 'Vancouver',     region: 'United States & Canada' },

  { id: 'America/Mexico_City', city: 'Mexico City',   region: 'Latin America' },
  { id: 'America/Bogota',      city: 'Bogotá',        region: 'Latin America' },
  { id: 'America/Lima',        city: 'Lima',          region: 'Latin America' },
  { id: 'America/Santiago',    city: 'Santiago',      region: 'Latin America' },
  { id: 'America/Sao_Paulo',   city: 'São Paulo',     region: 'Latin America' },
  { id: 'America/Argentina/Buenos_Aires', city: 'Buenos Aires', region: 'Latin America' },

  { id: 'Europe/London',       city: 'London',        region: 'Europe' },
  { id: 'Europe/Dublin',       city: 'Dublin',        region: 'Europe' },
  { id: 'Europe/Lisbon',       city: 'Lisbon',        region: 'Europe' },
  { id: 'Europe/Madrid',       city: 'Madrid',        region: 'Europe' },
  { id: 'Europe/Paris',        city: 'Paris',         region: 'Europe' },
  { id: 'Europe/Amsterdam',    city: 'Amsterdam',     region: 'Europe' },
  { id: 'Europe/Berlin',       city: 'Berlin',        region: 'Europe' },
  { id: 'Europe/Zurich',       city: 'Zurich',        region: 'Europe' },
  { id: 'Europe/Rome',         city: 'Rome',          region: 'Europe' },
  { id: 'Europe/Stockholm',    city: 'Stockholm',     region: 'Europe' },
  { id: 'Europe/Warsaw',       city: 'Warsaw',        region: 'Europe' },
  { id: 'Europe/Istanbul',     city: 'Istanbul',      region: 'Europe' },
  { id: 'Europe/Moscow',       city: 'Moscow',        region: 'Europe' },

  { id: 'Africa/Casablanca',   city: 'Casablanca',    region: 'Middle East & Africa' },
  { id: 'Africa/Lagos',        city: 'Lagos',         region: 'Middle East & Africa' },
  { id: 'Africa/Cairo',        city: 'Cairo',         region: 'Middle East & Africa' },
  { id: 'Africa/Nairobi',      city: 'Nairobi',       region: 'Middle East & Africa' },
  { id: 'Africa/Johannesburg', city: 'Johannesburg',  region: 'Middle East & Africa' },
  { id: 'Asia/Jerusalem',      city: 'Tel Aviv',      region: 'Middle East & Africa' },
  { id: 'Asia/Riyadh',         city: 'Riyadh',        region: 'Middle East & Africa' },
  { id: 'Asia/Dubai',          city: 'Dubai',         region: 'Middle East & Africa' },

  { id: 'Asia/Karachi',        city: 'Karachi',       region: 'Asia & Pacific' },
  { id: 'Asia/Kolkata',        city: 'Mumbai',        region: 'Asia & Pacific' },
  { id: 'Asia/Dhaka',          city: 'Dhaka',         region: 'Asia & Pacific' },
  { id: 'Asia/Bangkok',        city: 'Bangkok',       region: 'Asia & Pacific' },
  { id: 'Asia/Jakarta',        city: 'Jakarta',       region: 'Asia & Pacific' },
  { id: 'Asia/Singapore',      city: 'Singapore',     region: 'Asia & Pacific' },
  { id: 'Asia/Hong_Kong',      city: 'Hong Kong',     region: 'Asia & Pacific' },
  { id: 'Asia/Shanghai',       city: 'Shanghai',      region: 'Asia & Pacific' },
  { id: 'Asia/Tokyo',          city: 'Tokyo',         region: 'Asia & Pacific' },
  { id: 'Asia/Seoul',          city: 'Seoul',         region: 'Asia & Pacific' },
  { id: 'Asia/Manila',         city: 'Manila',        region: 'Asia & Pacific' },
  { id: 'Australia/Perth',     city: 'Perth',         region: 'Asia & Pacific' },
  { id: 'Australia/Brisbane',  city: 'Brisbane',      region: 'Asia & Pacific' },
  { id: 'Australia/Sydney',    city: 'Sydney',        region: 'Asia & Pacific' },
  { id: 'Pacific/Auckland',    city: 'Auckland',      region: 'Asia & Pacific' },
]

/** The regions, in the order the picker should show them. */
export const TIMEZONE_REGIONS = [...new Set(TIMEZONES.map((t) => t.region))]

const BY_ID = new Map(TIMEZONES.map((t) => [t.id, t]))

/**
 * Whether a zone may be written to the database.
 *
 * Asymmetric with `parseTimezone` below, on purpose and for the same reason
 * `constants/locales.js` is: a bad value must never get *in*, but a row that
 * somehow holds one must still render rather than throw. A till that crashes
 * is worse than one showing the wrong day boundary.
 *
 * Anything `Intl` can resolve is accepted, not merely the curated list — the
 * list is what the picker offers, not the limit of what is legal, and a café
 * in a zone nobody thought to add should not be refused because of it.
 */
export function isTimezone(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** A stored zone, or the default if it is missing or unusable. */
export function parseTimezone(value) {
  return isTimezone(value) ? value : DEFAULT_TIMEZONE
}

/** The curated entry for a zone, or a usable one built from its IANA name. */
export function timezoneInfo(id) {
  const known = BY_ID.get(id)
  if (known) return known
  // A zone that is legal but not on the list — set before the picker existed,
  // or by hand. Its own name is the best label available.
  const city = String(id ?? '').split('/').pop()?.replace(/_/g, ' ') ?? ''
  return { id, city: city || String(id ?? ''), region: 'Other' }
}

/**
 * What the clock says in that zone right now, as "14:32".
 *
 * The picker's whole job is answering "is this the right one", and a person
 * knows what time it is where their café is. Twenty-four hour, because it is
 * being compared against a trading-day boundary that is also stated as an
 * hour.
 */
export function currentTimeIn(id, now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: id, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(now)
  } catch {
    return ''
  }
}
