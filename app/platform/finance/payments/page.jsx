'use client'
import { useState } from 'react'
import { usePlatformBooks } from '@/context/PlatformBooksContext.jsx'
import { formatMoney, formatShortDateTime } from '@/utils/formatting.js'
import { SkeletonLines } from '@/components/Skeleton.jsx'

const METHODS = ['bank', 'cash', 'card', 'online', 'other']

const today = () => new Date().toISOString().slice(0, 10)
/** The month an instant falls in, as the value an <input type="month"> wants. */
const thisMonth = () => new Date().toISOString().slice(0, 7)

/**
 * Money in: a payment a café has actually made.
 *
 * Choosing a café fills the amount in from what they are priced at, because
 * that is what it almost always is — and it stays editable, because sometimes
 * it isn't.
 */
export default function PlatformPaymentsPage() {
  const { report, payments, addPayment, removePayment, loading } = usePlatformBooks()
  const cafes = report?.perCafe ?? []

  const [tenantId, setTenantId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('bank')
  const [period, setPeriod] = useState(thisMonth)
  const [receivedAt, setReceivedAt] = useState(today)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)

  function chooseCafe(id) {
    setTenantId(id)
    const c = cafes.find((x) => x.tenantId === id)
    if (c && c.monthlyPrice > 0 && !amount) setAmount(String(c.monthlyPrice))
  }

  const canSave = tenantId && Number(amount) > 0 && !saving

  async function submit(e) {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    const ok = await addPayment({
      tenantId, amount: Number(amount), method, note: note.trim(),
      period: period ? `${period}-01` : null,
      receivedAt: new Date(`${receivedAt}T12:00:00Z`).toISOString(),
    })
    setSaving(false)
    if (ok) { setAmount(''); setNote('') }
  }

  const total = payments.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="books-split">
      <form className="pf-card pf-form books-entry" onSubmit={submit}>
        <h2>Record a payment</h2>
        <p>Money a café has actually paid. Not what they owe — that is worked out from their price.</p>

        <label className="pf-field">
          <span>Which café</span>
          <select className="select" value={tenantId} onChange={(e) => chooseCafe(e.target.value)} disabled={saving} required>
            <option value="">Choose a café…</option>
            {cafes.map((c) => (
              <option key={c.tenantId} value={c.tenantId}>
                {c.name}{c.monthlyPrice > 0 ? ` — ${formatMoney(c.monthlyPrice)}/mo` : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="books-field-row">
          <label className="pf-field">
            <span>Amount</span>
            <input type="number" min="0" step="0.01" value={amount} inputMode="decimal"
                   onChange={(e) => setAmount(e.target.value)} placeholder="0.00" disabled={saving} required />
          </label>
          <label className="pf-field">
            <span>Received</span>
            <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} disabled={saving} required />
          </label>
        </div>

        <div className="books-field-row">
          <label className="pf-field">
            <span>For the month of</span>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} disabled={saving} />
            <span className="pf-hint">Clear it for a one-off, like a setup fee.</span>
          </label>
          <label className="pf-field">
            <span>How</span>
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value)} disabled={saving}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </div>

        <label className="pf-field">
          <span>Note <span className="pf-hint">optional</span></span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} disabled={saving}
                 placeholder="Bank transfer ref 88213" />
        </label>

        <div className="pf-actions">
          <button type="submit" className="primary" disabled={!canSave}>
            {saving ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </form>

      <div className="pf-card">
        <h2>Received in this period</h2>
        <p>{payments.length} payment{payments.length === 1 ? '' : 's'} · {formatMoney(total)}</p>
        {loading && payments.length === 0 ? <SkeletonLines rows={3} label="Loading payments…" /> : null}
        {!loading && payments.length === 0 ? <p className="pf-hint">Nothing received in this period.</p> : null}
        {payments.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table table-cards">
              <thead>
                <tr><th>Café</th><th className="num">Amount</th><th>Received</th><th aria-label="Remove" /></tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="cell-card-title">
                      <span className="block">{p.tenantName}</span>
                      <span className="cafe-slug">
                        {p.period ? `for ${p.period.slice(0, 7)}` : 'one-off'} · {p.method}{p.note ? ` · ${p.note}` : ''}
                      </span>
                    </td>
                    <td className="num" data-label="Amount">{formatMoney(p.amount)}</td>
                    <td data-label="Received">{formatShortDateTime(p.receivedAt)}</td>
                    <td className="num cell-card-action">
                      {pendingDelete === p.id ? (
                        <span className="books-confirm">
                          <button type="button" className="ghost danger sm" onClick={() => { setPendingDelete(null); void removePayment(p.id) }}>Remove</button>
                          <button type="button" className="ghost sm" onClick={() => setPendingDelete(null)}>Keep</button>
                        </span>
                      ) : (
                        <button type="button" className="ghost sm" onClick={() => setPendingDelete(p.id)} aria-label={`Remove payment from ${p.tenantName}`}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}
