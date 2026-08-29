import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CURRENCIES, LANGUAGES, DEFAULT_CURRENCY, DEFAULT_LOCALE,
  parseCurrency, parseLocale, isCurrency, isLocale, directionOf, currencyInfo,
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

test('every offered language is a tag Intl can actually format', () => {
  for (const l of LANGUAGES) {
    assert.doesNotThrow(() => new Intl.NumberFormat(l.tag), `${l.tag} is not a locale Intl knows`)
  }
})

test('the defaults are themselves offered, so the picker can show what is stored', () => {
  assert.ok(isCurrency(DEFAULT_CURRENCY))
  assert.ok(isLocale(DEFAULT_LOCALE))
})

// ── Parsing: lenient on the way out, strict on the way in ───────────────────

test('parsing falls back rather than throwing, so a stale row still renders', () => {
  assert.equal(parseCurrency('ZZZ'), DEFAULT_CURRENCY)
  assert.equal(parseCurrency(null), DEFAULT_CURRENCY)
  assert.equal(parseLocale('xx-YY'), DEFAULT_LOCALE)
  assert.equal(parseLocale(undefined), DEFAULT_LOCALE)
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
  assert.equal(isLocale('xx-YY'), false)
  assert.equal(parseLocale('xx-YY'), DEFAULT_LOCALE)
})

test('a language tag is matched exactly — es-MX is not es-ES', () => {
  assert.ok(isLocale('es-MX'))
  assert.equal(isLocale('es'), false)
})

// ── Writing direction ───────────────────────────────────────────────────────

test('Arabic and Urdu are right to left, and everything else is not', () => {
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

test('a language decides the separators, not just the words', () => {
  // The reason one setting covers both: "Spanish" alone cannot say whether
  // 1.234,56 or 1,234.56 is meant.
  const de = formatMoney(1234.56, { locale: 'de-DE', currency: 'EUR' })
  assert.ok(de.includes('1.234,56'), de)
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

test('dates follow the café’s language too', () => {
  const iso = '2026-08-29T14:30:00Z'
  assert.notEqual(
    formatShortDateTime(iso, { locale: 'en-US', timeZone: 'UTC' }),
    formatShortDateTime(iso, { locale: 'es-MX', timeZone: 'UTC' }),
  )
})

test('an unparseable date is a dash, not an Invalid Date', () => {
  assert.equal(formatShortDateTime('not a date'), '—')
})

test('currencyInfo always answers, so a symbol beside an input is never blank', () => {
  assert.equal(currencyInfo('USD').symbol, '$')
  assert.equal(currencyInfo('ZZZ').code, DEFAULT_CURRENCY)
})
