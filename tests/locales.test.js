import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CURRENCIES, DEFAULT_CURRENCY, DEFAULT_LOCALE,
  parseCurrency, isCurrency, localeForCurrency, directionOf, currencyInfo,
} from '../constants/locales.js'
import { formatMoney, moneyFormatter, formatShortDateTime } from '../utils/formatting.js'

// ── The lists themselves ────────────────────────────────────────────────────

test('every offered currency is one Intl can actually format', () => {
  // The whole point of a curated list: a code in it that Intl rejects would
  // send every price on that café's screens through the fallback.
  for (const c of CURRENCIES) {
    assert.doesNotThrow(
      () => new Intl.NumberFormat('en-US', { style: 'currency', currency: c.code }),
      `${c.code} is not a currency Intl knows`,
    )
  }
})

test('every currency carries a locale Intl can actually format', () => {
  // The currency is now the only regional choice, so a row whose locale Intl
  // rejects would send that market's dates and separators through a fallback
  // with nothing in the interface to correct it.
  for (const c of CURRENCIES) {
    assert.doesNotThrow(() => new Intl.NumberFormat(c.locale), `${c.locale} is not a locale Intl knows`)
    assert.doesNotThrow(() => new Intl.DateTimeFormat(c.locale), `${c.locale} is not a locale Intl knows`)
  }
})

test('every currency formats in English, because every label in the app is', () => {
  // The reason there is no language picker: choosing a currency must never be
  // a way to half-translate the app into a language it has no words for.
  for (const c of CURRENCIES) {
    assert.equal(c.locale.split('-')[0], 'en', `${c.code} is set to ${c.locale}`)
  }
})

test('the default currency is offered, and the default locale is the one it implies', () => {
  assert.ok(isCurrency(DEFAULT_CURRENCY))
  assert.equal(localeForCurrency(DEFAULT_CURRENCY), DEFAULT_LOCALE)
})

test('the locale follows the currency, so dollars are never written the Pakistani way', () => {
  assert.equal(localeForCurrency('USD'), 'en-US')
  assert.equal(localeForCurrency('GBP'), 'en-GB')
  assert.equal(localeForCurrency('PKR'), 'en-PK')
})

test('a currency nobody offers still yields a usable locale', () => {
  // The read path calls this on whatever the row holds. A café whose code was
  // dropped from the list needs a date on its receipt, not an exception.
  assert.equal(localeForCurrency('ZZZ'), DEFAULT_LOCALE)
  assert.equal(localeForCurrency(null), DEFAULT_LOCALE)
})

// ── Parsing: lenient on the way out, strict on the way in ───────────────────

test('parsing falls back rather than throwing, so a stale row still renders', () => {
  assert.equal(parseCurrency('ZZZ'), DEFAULT_CURRENCY)
  assert.equal(parseCurrency(null), DEFAULT_CURRENCY)
})

test('a currency is accepted in any case, because forms send what they are given', () => {
  assert.equal(parseCurrency('usd'), 'USD')
  assert.equal(parseCurrency(' eur '), 'EUR')
  assert.ok(isCurrency('usd'))
})

test('the strict checks refuse what the lenient ones would silently swallow', () => {
  // This pairing is what stops a bad code reaching the database: the write
  // path asks isCurrency, which says no, instead of asking parseCurrency,
  // which would answer PKR and store a café's prices in the wrong money.
  assert.equal(isCurrency('ZZZ'), false)
  assert.equal(parseCurrency('ZZZ'), DEFAULT_CURRENCY)
})

// ── Writing direction ───────────────────────────────────────────────────────

test('Arabic and Urdu are right to left, and everything else is not', () => {
  // Nothing hands out these tags today — every locale a currency implies is
  // English. Kept because the tag is still what decides the question, and a
  // translation shipping is what changes the answer.
  assert.equal(directionOf('ar-AE'), 'rtl')
  assert.equal(directionOf('ur-PK'), 'rtl')
  assert.equal(directionOf('en-US'), 'ltr')
  assert.equal(directionOf('es-MX'), 'ltr')
  assert.equal(directionOf(null), 'ltr')
})

// ── Formatting ──────────────────────────────────────────────────────────────

test('a café in the US sees dollars, and one in Pakistan still sees rupees', () => {
  assert.match(formatMoney(1250.5, { locale: 'en-US', currency: 'USD' }), /^\$1,250\.50$/)
  assert.match(formatMoney(1250.5, { locale: 'en-PK', currency: 'PKR' }), /1,250\.50/)
})

test('the default arguments are still Pakistan, so an un-updated caller is unchanged', () => {
  assert.equal(formatMoney(99), formatMoney(99, { locale: DEFAULT_LOCALE, currency: DEFAULT_CURRENCY }))
})

test('the locale decides the separators, which is what it is kept for', () => {
  // Why the currency has to carry a region and not just "English": en-ZA
  // writes the same amount with a space and a comma.
  // Whitespace stripped before comparing: South Africa's thousands separator
  // is a non-breaking space, and which one Intl picks is not the point here.
  const za = formatMoney(1234.56, { locale: localeForCurrency('ZAR'), currency: 'ZAR' })
  assert.equal(za.replace(/\s/gu, ''), 'R1234,56')
  const us = formatMoney(1234.56, { locale: localeForCurrency('USD'), currency: 'USD' })
  assert.equal(us, '$1,234.56')
})

test('an unknown pair formats rather than throwing', () => {
  // constants/locales validates on the way in; this is the net under it, and a
  // till that throws instead of printing a price is worse than a wrong symbol.
  assert.doesNotThrow(() => moneyFormatter({ locale: 'nonsense', currency: 'ZZZ' })(5))
})

test('a formatter is reused for the same pair, so the menu board pays once', () => {
  assert.equal(moneyFormatter({ locale: 'en-US', currency: 'USD' }),
               moneyFormatter({ locale: 'en-US', currency: 'USD' }))
  assert.notEqual(moneyFormatter({ locale: 'en-US', currency: 'USD' }),
                  moneyFormatter({ locale: 'en-US', currency: 'EUR' }))
})

test('a non-numeric amount reads as zero rather than NaN', () => {
  assert.equal(moneyFormatter({ locale: 'en-US', currency: 'USD' })(undefined), '$0.00')
})

test('dates follow the café’s currency too — 8/29 in Dallas, 29 Aug in London', () => {
  const iso = '2026-08-29T14:30:00Z'
  assert.notEqual(
    formatShortDateTime(iso, { locale: localeForCurrency('USD'), timeZone: 'UTC' }),
    formatShortDateTime(iso, { locale: localeForCurrency('GBP'), timeZone: 'UTC' }),
  )
})

test('an unparseable date is a dash, not an Invalid Date', () => {
  assert.equal(formatShortDateTime('not a date'), '—')
})

test('currencyInfo always answers, so a symbol beside an input is never blank', () => {
  assert.equal(currencyInfo('USD').symbol, '$')
  assert.equal(currencyInfo('ZZZ').code, DEFAULT_CURRENCY)
})
