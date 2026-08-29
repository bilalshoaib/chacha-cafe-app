/**
 * The currencies and languages a café can trade and read in.
 *
 * Both live on the location row, not here — a business can open across a
 * border, and the branch is the thing that has a till, a currency and a
 * language. This file is only the list of what may be chosen and what happens
 * when nothing has been: no database, no React, importable from a route
 * handler and a client component alike.
 *
 * The defaults are Pakistan because that is what every existing row holds and
 * what the app rendered before any of this existed. A café created today picks
 * its own on the way in; a café created before this shipped keeps rendering
 * exactly as it did.
 */

export const DEFAULT_CURRENCY = 'PKR'
export const DEFAULT_LOCALE = 'en-PK'

/**
 * The currencies offered in the picker.
 *
 * Not every ISO 4217 code — a list of 180 is a worse answer than a list of 20
 * when the person choosing runs one café and knows exactly which one they
 * want. `code` is what is stored; the rest is what makes the row readable in a
 * dropdown. Adding a market means adding a line here.
 *
 * How many decimal places each has is deliberately absent: Intl already knows
 * the minor unit of every one of these, and a second opinion stored here would
 * eventually disagree with it.
 */
export const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: '$' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳' },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: '₨' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: '$' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
]

/**
 * The languages offered in the picker.
 *
 * A BCP 47 tag, because one value has to answer two questions: which words to
 * show, and how this place writes a number and a date. "Spanish" alone cannot
 * say whether 1.234,56 or 1,234.56 is meant, and a café in Texas and a café in
 * Madrid disagree about it.
 *
 * `label` is the language in its own script, because somebody choosing their
 * language cannot necessarily read the current one. `region` disambiguates the
 * pairs that share a language.
 */
export const LANGUAGES = [
  { tag: 'en-US', label: 'English', region: 'United States' },
  { tag: 'en-CA', label: 'English', region: 'Canada' },
  { tag: 'en-GB', label: 'English', region: 'United Kingdom' },
  { tag: 'en-AU', label: 'English', region: 'Australia' },
  { tag: 'en-PK', label: 'English', region: 'Pakistan' },
  { tag: 'en-IN', label: 'English', region: 'India' },
  { tag: 'en-AE', label: 'English', region: 'United Arab Emirates' },
  { tag: 'es-US', label: 'Español', region: 'Estados Unidos' },
  { tag: 'es-MX', label: 'Español', region: 'México' },
  { tag: 'es-ES', label: 'Español', region: 'España' },
  { tag: 'fr-CA', label: 'Français', region: 'Canada' },
  { tag: 'fr-FR', label: 'Français', region: 'France' },
  { tag: 'pt-BR', label: 'Português', region: 'Brasil' },
  { tag: 'de-DE', label: 'Deutsch', region: 'Deutschland' },
  { tag: 'tr-TR', label: 'Türkçe', region: 'Türkiye' },
  { tag: 'ur-PK', label: 'اردو', region: 'پاکستان' },
  { tag: 'ar-AE', label: 'العربية', region: 'الإمارات' },
  { tag: 'ar-SA', label: 'العربية', region: 'السعودية' },
  { tag: 'hi-IN', label: 'हिन्दी', region: 'भारत' },
  { tag: 'bn-BD', label: 'বাংলা', region: 'বাংলাদেশ' },
  { tag: 'ms-MY', label: 'Bahasa Melayu', region: 'Malaysia' },
  { tag: 'zh-CN', label: '中文', region: '中国' },
]

/**
 * The languages written right to left, which the page has to be told about
 * before it lays anything out.
 *
 * Matched on the language subtag rather than the whole tag so that adding
 * ar-EG above needs no second edit here.
 */
const RTL_LANGUAGES = new Set(['ar', 'ur', 'fa', 'he', 'ps', 'sd'])

/** 'rtl' or 'ltr', for the dir attribute on <html>. */
export function directionOf(tag) {
  return RTL_LANGUAGES.has(String(tag || '').split('-')[0]) ? 'rtl' : 'ltr'
}

const CURRENCY_CODES = new Set(CURRENCIES.map((c) => c.code))
const LANGUAGE_TAGS = new Set(LANGUAGES.map((l) => l.tag))

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

export function parseLocale(value) {
  const tag = String(value || '').trim()
  return LANGUAGE_TAGS.has(tag) ? tag : DEFAULT_LOCALE
}

export function isCurrency(value) {
  return CURRENCY_CODES.has(String(value || '').trim().toUpperCase())
}

export function isLocale(value) {
  return LANGUAGE_TAGS.has(String(value || '').trim())
}

/** The row for a code, for showing a symbol or a name beside a figure. */
export function currencyInfo(code) {
  return CURRENCIES.find((c) => c.code === parseCurrency(code)) ?? CURRENCIES[0]
}
