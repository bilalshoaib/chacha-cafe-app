'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import BusinessTypeBadge from '@/components/BusinessTypeBadge.jsx'
import { api } from '@/api.js'
import { expenseBusinessType } from '@/constants/businessTypes.js'
import { expenseCategoryLabel } from '@/utils/expenses.js'
import { formatMoney, formatShortDateTime } from '@/utils/formatting.js'

export default function ExpenseDetailPage() {
  const { expenseId } = useParams()
  const router = useRouter()
  const [row, setRow] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setError(''); setLoading(true)
      try {
        const r = await api.getExpense(expenseId)
        if (!cancelled) setRow(r)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load expense')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [expenseId])

  async function handleDelete() {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return
    setDeleting(true); setError('')
    try { await api.deleteExpense(expenseId); router.replace('/expenses') }
    catch (e) { setError(e.message || 'Could not delete') }
    finally { setDeleting(false) }
  }

  return (
    <main className="expenses-page expense-detail-page">
      <div className="expenses-head">
        <div>
          <p className="muted small team-detail-kicker">Expense</p>
          <h2>{row?.title ?? (loading ? '…' : 'Expense')}</h2>
        </div>
        <div className="expenses-head-actions row">
          <Link href="/expenses" className="ghost sm">← All expenses</Link>
          {row ? (
            <>
              <Link href={`/expenses/${row.id}/edit`} className="primary sm">Edit</Link>
              <button type="button" className="ghost sm danger" disabled={deleting} onClick={() => void handleDelete()}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <section className="card">
          <p className="banner error" role="alert">{error}</p>
          <p className="muted small"><Link href="/expenses" className="inline-link">Back to list</Link></p>
        </section>
      ) : null}

      {loading ? <p className="muted">Loading…</p> : row ? (
        <article className="card team-detail-card expense-detail-card">
          <dl className="team-detail-dl">
            <div><dt>Amount</dt><dd>{formatMoney(row.amount)}</dd></div>
            <div><dt>Business</dt><dd><BusinessTypeBadge type={expenseBusinessType(row)} /></dd></div>
            <div><dt>Category</dt><dd>{expenseCategoryLabel(row.category)}</dd></div>
            <div><dt>Date spent</dt><dd>{formatShortDateTime(row.spentAt || row.createdAt)}</dd></div>
            <div><dt>Recorded</dt><dd>{row.createdAt ? formatShortDateTime(row.createdAt) : '—'}</dd></div>
            <div><dt>Note</dt><dd>{row.note?.trim() ? row.note : '—'}</dd></div>
          </dl>
        </article>
      ) : null}
    </main>
  )
}
