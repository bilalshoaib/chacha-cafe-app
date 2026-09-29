'use client'
import { useEffect, useState } from 'react'
import { api } from '@/api.js'

const OPTIONS = [
  {
    value: 'unpaid',
    title: 'Start unpaid',
    hint: 'Serve first, take the money at the end. Each invoice is marked paid from its own page once the customer settles up.',
  },
  {
    value: 'cash',
    title: 'Paid in cash',
    hint: 'The customer pays as they order. Every new sale is marked paid in cash the moment it is rung up.',
  },
  {
    value: 'online',
    title: 'Paid online / by card',
    hint: 'The customer pays as they order, by card or online. Every new sale is marked paid that way the moment it is rung up.',
  },
]

const SAVED = {
  unpaid: 'New orders now start unpaid.',
  cash: 'New orders are now marked paid in cash.',
  online: 'New orders are now marked paid online / by card.',
}

/**
 * Whether a new order is rung up already paid. Uses the same radio cards as
 * the tax screen's "How prices are quoted", since it is the same kind of
 * choice: one café-wide answer, applied to every sale from the next one on.
 */
export default function NewOrderPaymentSettings() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [value, setValue] = useState('unpaid')

  useEffect(() => {
    api.checkoutSettings()
      .then((data) => setValue(data.newOrderPayment ?? 'unpaid'))
      .catch((err) => setError(err.message || 'Could not load this setting'))
      .finally(() => setLoading(false))
  }, [])

  async function choose(next) {
    setError(''); setMessage(''); setBusy(true)
    try {
      const res = await api.setNewOrderPayment(next)
      setValue(res.newOrderPayment)
      setMessage(SAVED[res.newOrderPayment])
    } catch (err) {
      setError(err.message || 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <section className="card settings-card" aria-busy="true">
        <p className="muted small">Loading…</p>
      </section>
    )
  }

  return (
    <section className="card settings-card">
      <h3 className="sub">When an order is rung up</h3>
      <div className="tax-mode" role="group" aria-label="When an order is rung up">
        {OPTIONS.map((o) => (
          <label key={o.value} className={`tax-mode-option${value === o.value ? ' tax-mode-option--active' : ''}`}>
            <input
              type="radio"
              name="newOrderPayment"
              checked={value === o.value}
              disabled={busy}
              onChange={() => void choose(o.value)}
            />
            <span>
              <strong>{o.title}</strong>
              <span className="muted small tax-mode-hint">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="muted small">
        Applies to sales from now on, including ones rung up while the till is offline once it has
        reconnected and picked up the change. Invoices already issued keep the status they have, and
        any single invoice can still be marked paid or unpaid from its own page.
      </p>
      {error ? <p className="banner error" role="alert">{error}</p> : null}
      {message ? <p className="banner success settings-banner-quiet" role="status">{message}</p> : null}
    </section>
  )
}
