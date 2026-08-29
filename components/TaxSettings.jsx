'use client'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api.js'
import { useMoney } from '@/context/BrandingContext.jsx'
import { computeInvoiceTax, invoiceTotal, TAX_ORDER_TYPES } from '@/lib/tax.js'

const ORDER_TYPE_LABELS = {
  dine_in: 'Dine in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
}

const BLANK = { name: '', rate: '', orderTypes: [], categories: [], enabled: true }

/**
 * The café's sales tax: the rates it charges, and whether its menu prices
 * already contain them.
 *
 * A component rather than a page so that app/settings/tax/page.jsx supplies
 * the title, the blurb and the way back, the same as every other settings
 * subpage does. It fetches its own data because — unlike the currency — the
 * rates are not on the branding road and there is nothing already resolved on
 * the server for it to be seeded from.
 *
 * The preview at the bottom is the point of the screen. "8.875% on dine-in
 * prepared food, prices exclusive" is not a sentence anybody can check by
 * reading it; a hundred-unit ticket priced by the same function the till uses
 * is.
 */
export default function TaxSettings() {
  const money = useMoney()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const [pricesIncludeTax, setPricesIncludeTax] = useState(true)
  const [rates, setRates] = useState([])
  const [categories, setCategories] = useState([])
  const [draft, setDraft] = useState(BLANK)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api.taxSettings()
      setPricesIncludeTax(Boolean(data.pricesIncludeTax))
      setRates(data.rates ?? [])
      setCategories(data.categories ?? [])
    } catch (err) {
      setError(err.message || 'Could not load tax settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  /** Every write goes through here, so no path can forget to clear the banners. */
  async function run(fn, okMessage) {
    setError(''); setMessage(''); setBusy(true)
    try {
      await fn()
      if (okMessage) setMessage(okMessage)
      return true
    } catch (err) {
      setError(err.message || 'Could not save')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function toggleInclusive(next) {
    await run(async () => {
      const res = await api.setPricesIncludeTax(next)
      setPricesIncludeTax(res.pricesIncludeTax)
    }, next
      ? 'Menu prices now include tax — totals are unchanged and the tax is shown broken out.'
      : 'Tax is now added on top of menu prices at checkout.')
  }

  async function addRate(e) {
    e.preventDefault()
    const ok = await run(async () => {
      const { rate } = await api.createTaxRate({
        name: draft.name,
        rate: Number(draft.rate),
        orderTypes: draft.orderTypes,
        categories: draft.categories,
      })
      setRates((prev) => [...prev, rate])
    }, 'Tax added.')
    if (ok) { setDraft(BLANK); setAdding(false) }
  }

  async function patchRate(id, body) {
    await run(async () => {
      const { rate } = await api.updateTaxRate(id, body)
      setRates((prev) => prev.map((r) => (r.id === id ? rate : r)))
    })
  }

  async function removeRate(rate) {
    // Deleting a rate changes only what the next sale is charged: every invoice
    // already made stores the rate it was charged, by value. Saying so is what
    // makes the confirmation answerable.
    if (!window.confirm(
      `Remove "${rate.name}" (${rate.rate}%)?\n\nInvoices already issued keep the tax they were charged. New sales will not include this.`,
    )) return
    await run(async () => {
      await api.deleteTaxRate(rate.id)
      setRates((prev) => prev.filter((r) => r.id !== rate.id))
    }, `Removed ${rate.name}.`)
  }

  // Priced by the same function the till and checkout use, against a single
  // hundred-unit line, so what this shows and what the receipt says cannot
  // disagree. Dine-in, because that is the order type every rate applies to.
  const sample = computeInvoiceTax({
    lines: [{ kind: 'item', category: categories[0]?.key ?? null, lineTotal: 100 }],
    rates,
    orderType: 'dine_in',
    pricesIncludeTax,
  })
  const sampleTotal = invoiceTotal({
    subtotal: 100, deliveryCharge: 0, taxTotal: sample.taxTotal, inclusive: sample.inclusive,
  })

  // A blank card rather than nothing: this is the whole of its page now, and
  // returning null left the screen empty apart from its heading while the
  // rates were fetched.
  if (loading) {
    return (
      <section className="card settings-card" aria-busy="true">
        <p className="muted small">Loading tax settings…</p>
      </section>
    )
  }

  return (
    <section className="card settings-card">
      <h3 className="sub">How prices are quoted</h3>
      <div className="tax-mode" role="group" aria-label="How prices are quoted">
        {[
          { value: true,  title: 'Prices include tax', hint: 'The board price is what the customer pays. Tax is carved out of it for the books. Common in Pakistan, the UK and the EU.' },
          { value: false, title: 'Tax added at checkout', hint: 'The board price is before tax and the total is higher. This is how the United States works.' },
        ].map(({ value, title, hint }) => (
          <label key={String(value)} className={`tax-mode-option${pricesIncludeTax === value ? ' tax-mode-option--active' : ''}`}>
            <input
              type="radio"
              name="pricesIncludeTax"
              checked={pricesIncludeTax === value}
              disabled={busy}
              onChange={() => void toggleInclusive(value)}
            />
            <span>
              <strong>{title}</strong>
              <span className="muted small tax-mode-hint">{hint}</span>
            </span>
          </label>
        ))}
      </div>

      {rates.length === 0 ? (
        <p className="muted small tax-empty">
          No tax configured — totals are the sum of the lines, as they are today.
        </p>
      ) : (
        <ul className="tax-rate-list">
          {rates.map((rate) => (
            <li key={rate.id} className={`tax-rate${rate.enabled ? '' : ' tax-rate--off'}`}>
              <div className="tax-rate-head">
                <strong>{rate.name}</strong>
                <span className="tax-rate-percent">{rate.rate}%</span>
              </div>
              <p className="muted small tax-rate-scope">
                {rate.orderTypes?.length
                  ? rate.orderTypes.map((t) => ORDER_TYPE_LABELS[t] ?? t).join(', ')
                  : 'All order types'}
                {' · '}
                {rate.categories?.length
                  ? rate.categories
                      .map((k) => categories.find((c) => c.key === k)?.label ?? k)
                      .join(', ')
                  : 'All items'}
              </p>
              <div className="tax-rate-actions">
                <button
                  type="button"
                  className="ghost sm"
                  disabled={busy}
                  onClick={() => void patchRate(rate.id, { enabled: !rate.enabled })}
                >
                  {rate.enabled ? 'Switch off' : 'Switch on'}
                </button>
                <button type="button" className="danger sm" disabled={busy} onClick={() => void removeRate(rate)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form onSubmit={(e) => void addRate(e)} className="settings-form tax-add-form">
          <label className="field">
            <span>Name (printed on the receipt)</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="State Sales Tax"
              maxLength={60}
              required
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>Rate (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.0001"
              inputMode="decimal"
              value={draft.rate}
              onChange={(e) => setDraft((d) => ({ ...d, rate: e.target.value }))}
              placeholder="8.875"
              required
              disabled={busy}
            />
          </label>

          <fieldset className="field tax-scope-field">
            <legend>Order types</legend>
            <p className="muted small">Leave all unticked to charge it on every order.</p>
            <div className="tax-checks">
              {TAX_ORDER_TYPES.map((t) => (
                <label key={t} className="tax-check">
                  <input
                    type="checkbox"
                    checked={draft.orderTypes.includes(t)}
                    disabled={busy}
                    onChange={(e) => setDraft((d) => ({
                      ...d,
                      orderTypes: e.target.checked
                        ? [...d.orderTypes, t]
                        : d.orderTypes.filter((x) => x !== t),
                    }))}
                  />
                  <span>{ORDER_TYPE_LABELS[t]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {categories.length > 0 ? (
            <fieldset className="field tax-scope-field">
              <legend>Menu categories</legend>
              <p className="muted small">
                Leave all unticked to charge it on everything. Deals are only ever taxed by rates
                that apply to everything — a deal spans categories at one price.
              </p>
              <div className="tax-checks">
                {categories.map((c) => (
                  <label key={c.key} className="tax-check">
                    <input
                      type="checkbox"
                      checked={draft.categories.includes(c.key)}
                      disabled={busy}
                      onChange={(e) => setDraft((d) => ({
                        ...d,
                        categories: e.target.checked
                          ? [...d.categories, c.key]
                          : d.categories.filter((x) => x !== c.key),
                      }))}
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="tax-add-actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Adding…' : 'Add tax'}
            </button>
            <button type="button" className="ghost" disabled={busy} onClick={() => { setAdding(false); setDraft(BLANK) }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="primary sm tax-add-button" disabled={busy} onClick={() => setAdding(true)}>
          Add a tax
        </button>
      )}

      {error ? <p className="banner error" role="alert">{error}</p> : null}
      {message ? <p className="banner success settings-banner-quiet" role="status">{message}</p> : null}

      <div className="locale-preview" aria-live="polite">
        <span className="muted small">
          A {money(100)} ticket would ring up as
        </span>
        <div className="locale-preview-row">
          <span className="muted small">Subtotal</span>
          <strong>{money(pricesIncludeTax ? 100 - sample.taxTotal : 100)}</strong>
          {sample.lines.map((l) => (
            <span key={l.id} className="muted small">
              · {l.name} {l.rate}% {money(l.amount)}
            </span>
          ))}
          <span className="muted">·</span>
          <span className="muted small">Total</span>
          <strong>{money(sampleTotal)}</strong>
        </div>
      </div>
    </section>
  )
}
