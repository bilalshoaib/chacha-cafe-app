/**
 * The currencies a café can trade in, and how each one writes a number.
 *
 * Currency lives on the location row, not here — a business can open across a
 * border, and the branch is the thing that has a till and a currency. This
 * file is only the list of what may be chosen and what happens when nothing
 * has been: no database, no React, importable from a route handler and a
 * client component alike.
 *
 * **There is no language choice.** Every label in this app is English and will
 * stay English until translation files exist, so offering a picker that
 * changed nothing but the decimal separator invited an owner to set their
 * café to Urdu and then wonder why the screen was still in English. What the
 * locale is actually needed for — 1,234.56 against 1.234,56, and 8/29 against
 * 29/8 — follows from the currency instead: a café charging in pounds is in a
 * market that writes dates the British way. See `localeForCurrency`.
 *
 * The defaults are Pakistan because that is what every existing row holds and
 * what the app rendered before any of this existed.
 */

export const DEFAULT_CURRENCY = 'PKR'
export const DEFAULT_LOCALE = 'en-PK'

/**
 * The currencies offered in the picker.
 *
 * Not every ISO 4217 code — a list of 180 is a worse answer than a list of 20
 * when the person choosing runs one café and knows exactly which one they
 * want. `code` is what is stored; `name` and `symbol` are what make the row
 * readable; `locale` is the formatting that comes with it.
 *
 * How many decimal places each has is deliberately absent: Intl already knows
 * the minor unit of every one of these, and a second opinion stored here would
 * eventually disagree with it.
 *
 * `locale` is always an English tag — the region is what varies, because the
 * region is the part that decides how a number and a date are written. Adding
 * a market means adding a line here, and both halves of it.
 */
export const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$', locale: 'en-US' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$', locale: 'en-CA' },
  { code: 'GBP', name: 'British Pound', symbol: '£', locale: 'en-GB' },
  { code: 'EUR', name: 'Euro', symbol: '€', locale: 'en-IE' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$', locale: 'en-AU' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: '$', locale: 'en-NZ' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', locale: 'en-AE' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', locale: 'en-SA' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼', locale: 'en-QA' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', locale: 'en-PK' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', locale: 'en-IN' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', locale: 'en-BD' },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: '₨', locale: 'en-LK' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', locale: 'en-MY' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: '$', locale: 'en-SG' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', locale: 'en-PH' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$', locale: 'en-MX' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', locale: 'en-BR' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', locale: 'en-ZA' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', locale: 'en-NG' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', locale: 'en-KE' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', locale: 'en-TR' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', locale: 'en-JP' },
]

/**
 * The languages written right to left, which the page has to be told about
 * before it lays anything out.
 *
 * Nothing selects one today — every locale this file hands out is English, so
 * `directionOf` answers 'ltr' every time. Kept because the tag is still what
 * decides the question, and the day a translation ships is the day the answer
 * changes without this having to be rediscovered.
 */
const RTL_LANGUAGES = new Set(['ar', 'ur', 'fa', 'he', 'ps', 'sd'])

/** 'rtl' or 'ltr', for the dir attribute on <html>. */
export function directionOf(tag) {
  return RTL_LANGUAGES.has(String(tag || '').split('-')[0]) ? 'rtl' : 'ltr'
}

const CURRENCY_CODES = new Set(CURRENCIES.map((c) => c.code))

/**
 * Validates a stored or submitted currency, falling back rather than throwing.
 *
 * Falls back because this is called on the read path as well as the write one:
 * a row holding a code that was removed from the list above must still render
 * a price, and rendering it in the default currency is a smaller wrong than
 * rendering nothing. The write path checks `isCurrency` first and refuses, so
 * nothing new gets in this way.
 */
export function parseCurrency(value) {
  const code = String(value || '').trim().toUpperCase()
  return CURRENCY_CODES.has(code) ? code : DEFAULT_CURRENCY
}

export function isCurrency(value) {
  return CURRENCY_CODES.has(String(value || '').trim().toUpperCase())
}

/**
 * The formatting locale that comes with a currency.
 *
 * The single answer to "what locale is this café in", used on both the read
 * path — where a row may still hold a language somebody picked before this
 * existed, which is ignored — and the write path, where it is what gets
 * stored beside the currency so the column never disagrees with this function.
 */
export function localeForCurrency(code) {
  return currencyInfo(code).locale
}

/** The row for a code, for showing a symbol or a name beside a figure. */
export function currencyInfo(code) {
  return CURRENCIES.find((c) => c.code === parseCurrency(code)) ?? CURRENCIES[0]
}
