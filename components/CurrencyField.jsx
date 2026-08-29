'use client'
import { useMemo, useState } from 'react'
import { CURRENCIES, localeForCurrency } from '@/constants/locales.js'
import { moneyFormatter, formatShortDateTime } from '@/utils/formatting.js'

/**
 * The one regional choice left: what a café trades in.
 *
 * Replaces the currency-and-language pair. There is no language field any more
 * — every label in the app is English until translation files exist — and the
 * number and date formatting that used to hang off the language now follows
 * the currency, so choosing dollars is choosing 1,234.56 and Aug 29 with it.
 *
 * The platform owner's, not the café's. It is set when a café is created and
 * changed from the console afterwards; the café's own settings screen shows it
 * and does not offer to change it. A café that has been trading for a month
 * does not switch currency, and the one time it happens — the owner opened in
 * another country — they ring the person who sold them the product.
 *
 * A grid of cards rather than a <select> because the choice is worth seeing
 * before it is made: a dropdown of 23 rows showed one at a time, in a list
 * nobody could search, and hid the thing actually being decided, which is what
 * a price is going to look like. Every card formats the same amount through
 * the same function the receipt uses, so the row is the answer.
 *
 * `fieldClass` exists because the café's screens style a form field as
 * `.field` and the platform console styles it as `.pf-field`, and this is
 * rendered inside both.
 */
export default function CurrencyField({
  currency,
  onCurrencyChange,
  disabled = false,
  fieldClass = 'field',
  label = 'Currency',
}) {
  const [query, setQuery] = useState('')

  // Formatted once for all 23, not per keystroke of the filter: the list is
  // fixed and Intl.NumberFormat construction is the expensive part.
  const cards = useMemo(
    () => CURRENCIES.map((c) => ({
      ...c,
      sample: moneyFormatter({ locale: c.locale, currency: c.code })(1234.56),
    })),
    [],
  )

  const needle = query.trim().toLowerCase()
  const shown = needle
    ? cards.filter((c) =>
        c.name.toLowerCase().includes(needle) ||
        c.code.toLowerCase().includes(needle) ||
        c.symbol.includes(needle))
    : cards

  // The point of the preview: somebody picking USD should not have to save,
  // navigate to the till and ring up a sale to find out what their receipts
  // will say. Formatted with the two functions the app itself uses, so it
  // cannot promise something the receipt will not deliver.
  const locale = localeForCurrency(currency)
  const preview = useMemo(() => {
    const money = moneyFormatter({ locale, currency })
    return { price: money(4.5), total: money(1234.56), when: formatShortDateTime(new Date(), { locale }) }
  }, [locale, currency])

  return (
    <div className={`${fieldClass} currency-field`}>
      <div className="currency-field-head">
        <span>{label}</span>
        <input
          type="search"
          className="currency-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 23 currencies…"
          aria-label="Search currencies"
          disabled={disabled}
        />
      </div>

      <div className="currency-grid" role="radiogroup" aria-label={label}>
        {shown.map((c) => (
          <label
            key={c.code}
            className={`currency-option${currency === c.code ? ' currency-option--active' : ''}`}
          >
            <input
              type="radio"
              name="currency"
              value={c.code}
              checked={currency === c.code}
              disabled={disabled}
              onChange={() => onCurrencyChange(c.code)}
            />
            <span className="currency-option-symbol" aria-hidden="true">{c.symbol}</span>
            <span className="currency-option-body">
              <strong className="currency-option-code">{c.code}</strong>
              <span className="currency-option-name">{c.name}</span>
            </span>
            <span className="currency-option-sample">{c.sample}</span>
          </label>
        ))}
        {shown.length === 0 ? (
          <p className="muted small currency-empty">
            No currency matches “{query.trim()}”. The list is deliberately short — ask for one to be
            added if a café needs it.
          </p>
        ) : null}
      </div>

      <div className="locale-preview" aria-live="polite">
        <span className="muted small">Prices and dates will read</span>
        <div className="locale-preview-row">
          <strong>{preview.price}</strong>
          <span className="muted">·</span>
          <strong>{preview.total}</strong>
          <span className="muted">·</span>
          <span className="muted small">{preview.when}</span>
        </div>
        <span className="muted small currency-locale-note">
          Number and date formatting: {locale}, set by the currency. Every screen stays in English.
        </span>
      </div>
    </div>
  )
}
