'use client'
import { useTenantConsole } from '@/context/TenantConsoleContext.jsx'
import CurrencyField from '@/components/CurrencyField.jsx'
import { currencyInfo } from '@/constants/locales.js'

/**
 * What a café trades in.
 *
 * A tab of its own, and not for lack of room on Details. It was the third card
 * down there, under a tab labelled "Name and web address", and this console is
 * the *only* place a currency can be changed — the café's own settings show it
 * and offer no picker. Somewhere unadvertised is a bad place to keep the only
 * copy of a control: it took a search of every tab to find it, which is a
 * question the person who sold the café should never have to ask.
 *
 * It is also the field most likely to be wrong on day one — every café created
 * before any of this existed is trading in rupees whether or not it has ever
 * seen one — so the fix a support call asks for is this screen.
 */
export default function TenantCurrencyPage() {
  const { tenant, details, setDetails, save, saving } = useTenantConsole()

  const dirty = details.currency !== tenant.currency
  const current = currencyInfo(tenant.currency)
  const chosen = currencyInfo(details.currency)

  return (
    <div className="tenant-tab-stack">
      <form
        className="pf-card pf-form"
        onSubmit={(e) => {
          e.preventDefault()
          void save({ currency: details.currency }, 'Currency saved.')
        }}
      >
        <h2>Currency</h2>
        <p>
          What they trade in, and with it how they write numbers and dates. Applies to their till,
          their menu board, their printed receipts and their reports — and to the figures this
          console quotes back at them. Every label in the app is English either way; the currency
          only decides the money and the formatting.
        </p>

        {/* What it is now, stated before what it could be. The picker below
            highlights the selection, but a highlight in a grid of 23 is not an
            answer to "what is this café on today" — and that is the question
            somebody arrives at this tab with. */}
        <p className="pf-current-value">
          Currently trading in <strong>{current.name} ({current.code})</strong>
          {dirty ? <> — unsaved change to <strong>{chosen.name} ({chosen.code})</strong></> : null}
        </p>

        <div className="pf-row">
          <CurrencyField
            currency={details.currency}
            onCurrencyChange={(currency) => setDetails((d) => ({ ...d, currency }))}
            disabled={saving}
            fieldClass="pf-field"
          />
        </div>

        <p className="pf-hint">
          Changes how money is displayed, not what anything costs. Prices already on their menu
          keep the numbers they were typed with, so a café moved from rupees to dollars will read
          450 as $450 until somebody reprices it.
        </p>

        <div className="pf-actions">
          <button type="submit" className="primary" disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save currency'}
          </button>
          {dirty ? (
            <button
              type="button"
              className="ghost"
              disabled={saving}
              onClick={() => setDetails((d) => ({ ...d, currency: tenant.currency }))}
            >
              Discard
            </button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
