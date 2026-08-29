'use client'
import { useMemo } from 'react'
import { CURRENCIES, LANGUAGES, currencyInfo } from '@/constants/locales.js'
import { moneyFormatter, formatShortDateTime } from '@/utils/formatting.js'

/**
 * The two regional choices a café makes: what it trades in and what it reads
 * in.
 *
 * Shared by the café's own settings, the console's tab for a café it supports,
 * and the form that creates one — so a café cannot be given a currency on the
 * way in that it has no way to change afterwards, and the three cannot drift
 * apart in what they offer.
 *
 * `fieldClass` exists because the café's screens style a form field as `.field`
 * and the platform console styles it as `.pf-field`, and this component is
 * rendered inside both. Passing the class beats shipping a second copy of the
 * markup or a stylesheet rule that has to know where it is.
 */
export default function LocaleFields({
  currency,
  locale,
  onCurrencyChange,
  onLocaleChange,
  disabled = false,
  fieldClass = 'field',
}) {
  // The whole point of the preview: an owner picking "es-MX" and "USD" should
  // not have to save, navigate to the till and ring up a sale to find out that
  // their receipts will say "$1,234.56". Formatted with the same two functions
  // the app itself uses, so it cannot promise something the receipt will not
  // deliver.
  const preview = useMemo(() => {
    const money = moneyFormatter({ locale, currency })
    return {
      price: money(4.5),
      total: money(1234.56),
      when: formatShortDateTime(new Date(), { locale }),
    }
  }, [locale, currency])

  return (
    <>
      <label className={fieldClass}>
        <span>Currency</span>
        <select
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
          disabled={disabled}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.code}) · {c.symbol}
            </option>
          ))}
        </select>
      </label>

      <label className={fieldClass}>
        <span>Language &amp; number format</span>
        <select
          value={locale}
          onChange={(e) => onLocaleChange(e.target.value)}
          disabled={disabled}
        >
          {LANGUAGES.map((l) => (
            <option key={l.tag} value={l.tag}>
              {l.label} — {l.region}
            </option>
          ))}
        </select>
      </label>

      <div className="locale-preview" aria-live="polite">
        <span className="muted small">Prices and dates will read</span>
        <div className="locale-preview-row">
          <strong>{preview.price}</strong>
          <span className="muted">·</span>
          <strong>{preview.total}</strong>
          <span className="muted">·</span>
          <span className="muted small">{preview.when}</span>
        </div>
      </div>
    </>
  )
}

/** The currency's symbol on its own, for a label beside an amount input. */
export function currencySymbol(code) {
  return currencyInfo(code).symbol
}
