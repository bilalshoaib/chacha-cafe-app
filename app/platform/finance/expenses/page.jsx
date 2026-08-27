'use client'
import { useState } from 'react'
import { usePlatformBooks } from '@/context/PlatformBooksContext.jsx'
import { formatMoney, formatShortDateTime } from '@/utils/formatting.js'

const CATEGORIES = ['hosting', 'domains', 'software', 'salaries', 'marketing', 'equipment', 'fees', 'other']

/** Today, as the value an <input type="date"> wants. */
const today = () => new Date().toISOString().slice(0, 10)

/**
 * Expense mode: what running the platform costs.
 *
 * The form stays on screen after a save rather than clearing itself away,
 * because costs are entered in batches — a month of receipts in one sitting —
 * and the date and category are almost always the same as the last one. Only
 * the description and amount are cleared.
 */
export default function PlatformExpensesPage() {
  const { expenses, addExpense, removeExpense, loading } = usePlatformBooks()

  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('hosting')
  const [spentAt, setSpentAt] = useState(today)
  const [recurring, setRecurring] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)

  const canSave = title.trim() && Number(amount) > 0 && !saving

  async function submit(e) {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    const ok = await addExpense({
      title: title.trim(), amount: Number(amount), category, note: note.trim(), recurring,
      spentAt: new Date(`${spentAt}T12:00:00Z`).toISOString(),
    })
    setSaving(false)
    if (ok) { setTitle(''); setAmount(''); setNote('') }
  }

  const total = expenses.reduce((s, x) => s + x.amount, 0)

  return (
    <div className="books-split">
      <form className="pf-card pf-form books-entry" onSubmit={submit}>
        <h2>Add an expense</h2>
        <p>What the platform paid out. Its own costs, not any café’s.</p>

        <label className="pf-field">
          <span>What was it for</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
                 placeholder="Neon database — August" disabled={saving} required />
        </label>

        <div className="books-field-row">
          <label className="pf-field">
            <span>Amount</span>
            <input type="number" min="0" step="0.01" value={amount} inputMode="decimal"
                   onChange={(e) => setAmount(e.target.value)} placeholder="0.00" disabled={saving} required />
          </label>
          <label className="pf-field">
            <span>Date</span>
            <input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} disabled={saving} required />
          </label>
        </div>

        <label className="pf-field">
          <span>Category</span>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} disabled={saving}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label className="pf-field">
          <span>Note <span className="pf-hint">optional</span></span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} disabled={saving} />
        </label>

        <label className="books-check">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} disabled={saving} />
          <span>This repeats every month</span>
          <span className="pf-hint">Counted separately, so you can see what next month already owes.</span>
        </label>

        <div className="pf-actions">
          <button type="submit" className="primary" disabled={!canSave}>
            {saving ? 'Saving…' : 'Add expense'}
          </button>
        </div>
      </form>

      <div className="pf-card">
        <h2>Spent in this period</h2>
        <p>{expenses.length} item{expenses.length === 1 ? '' : 's'} · {formatMoney(total)}</p>
        {loading && expenses.length === 0 ? <p className="pf-hint">Loading…</p> : null}
        {!loading && expenses.length === 0 ? <p className="pf-hint">Nothing recorded in this period.</p> : null}
        {expenses.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr><th>What</th><th className="num">Amount</th><th>When</th><th aria-label="Remove" /></tr>
              </thead>
              <tbody>
                {expenses.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <span className="block">{x.title}{x.recurring ? <span className="pill books-pill-repeat">monthly</span> : null}</span>
                      <span className="cafe-slug">{x.category}{x.note ? ` · ${x.note}` : ''}</span>
                    </td>
                    <td className="num">{formatMoney(x.amount)}</td>
                    <td>{formatShortDateTime(x.spentAt)}</td>
                    <td className="num">
                      {pendingDelete === x.id ? (
                        <span className="books-confirm">
                          <button type="button" className="ghost danger sm" onClick={() => { setPendingDelete(null); void removeExpense(x.id) }}>Remove</button>
                          <button type="button" className="ghost sm" onClick={() => setPendingDelete(null)}>Keep</button>
                        </span>
                      ) : (
                        <button type="button" className="ghost sm" onClick={() => setPendingDelete(x.id)} aria-label={`Remove ${x.title}`}>×</button>
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
