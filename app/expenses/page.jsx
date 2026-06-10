'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import BusinessTypeBadge from '@/components/BusinessTypeBadge.jsx'
import { BUSINESS_TYPES, expenseBusinessType } from '@/constants/businessTypes.js'
import { EXPENSE_RANGE_PRESETS, expenseCategoryLabel, startOfMonth, toISOEnd, toISOStart } from '@/utils/expenses.js'
import { formatMoney, formatShortDateTime } from '@/utils/formatting.js'

export default function ExpensesListPage() {
  const [presetId, setPresetId] = useState('this_month')
  const [filterType, setFilterType] = useState('all')
  const [fromIso, setFromIso] = useState(() => toISOStart(startOfMonth(new Date())))
  const [toIso, setToIso] = useState(() => toISOEnd(new Date()))
  const [expenses, setExpenses] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const applyPreset = useCallback((id) => {
    const p = EXPENSE_RANGE_PRESETS.find((x) => x.id === id)
    if (!p) return
    const { from, to } = p.range()
    setFromIso(from)
    setToIso(to)
  }, [])

  useEffect(() => { applyPreset(presetId) }, [presetId, applyPreset])

  const load = useCallback(async () => {
    setError(''); setLoading(true)
    try {
      const params = {}
      if (fromIso) params.from = fromIso
      if (toIso) params.to = toIso
      if (filterType !== 'all') params.businessType = filterType
      const res = await api.getExpenses(params)
      setExpenses(Array.isArray(res.expenses) ? res.expenses : [])
      setTotal(Number(res.total) || 0)
    } catch (e) {
      setError(e.message || 'Could not load expenses')
      setExpenses([]); setTotal(0)
    } finally { setLoading(false) }
  }, [fromIso, toIso, filterType])

  useEffect(() => { void load() }, [load])

  const rangeSummary = useMemo(() => {
    if (presetId === 'all') return 'All recorded expenses'
    if (!fromIso || !toIso) return ''
    try { return `${formatShortDateTime(fromIso)} → ${formatShortDateTime(toIso)}` }
    catch { return '' }
  }, [presetId, fromIso, toIso])

  return (
    <main className="expenses-page">
      <div className="expenses-head">
        <div>
          <h2>Expenses</h2>
          <p className="muted small">Operating costs by date (PKR). Filter by business, Chacha Cafe or Chacha Burger.</p>
        </div>
        <div className="expenses-head-actions row">
          <Link href="/expenses/new" className="primary sm">Add expense</Link>
          <Link href="/orders" className="ghost sm">← Take order</Link>
        </div>
      </div>

      <section className="card expenses-filters-card">
        <h3 className="sub">Date range</h3>
        <div className="expenses-presets">
          {EXPENSE_RANGE_PRESETS.map((p) => (
            <button key={p.id} type="button" className={presetId === p.id ? 'primary sm' : 'ghost sm'} onClick={() => setPresetId(p.id)}>{p.label}</button>
          ))}
        </div>
        {rangeSummary ? <p className="muted small expenses-range-line">{rangeSummary}</p> : null}
        <h3 className="sub invoices-business-heading">Business</h3>
        <div className="invoices-filter-tabs">
          <button type="button" className={filterType === 'all' ? 'primary sm' : 'ghost sm'} onClick={() => setFilterType('all')}>All</button>
          {BUSINESS_TYPES.map((bt) => (
            <button key={bt.id} type="button" className={filterType === bt.id ? 'primary sm' : 'ghost sm'} onClick={() => setFilterType(bt.id)}>{bt.shortLabel}</button>
          ))}
        </div>
      </section>

      {error ? (
        <p className="banner error" role="alert">
          {error}{' '}
          <button type="button" className="inline-link-button" onClick={() => void load()}>Retry</button>
        </p>
      ) : null}

      <section className="card expenses-summary-card">
        <div className="expenses-summary-row">
          <span className="muted">Total in range</span>
          <strong className="expenses-total-value">{loading ? '…' : formatMoney(total)}</strong>
        </div>
      </section>

      <section className="card expenses-table-card">
        <h3 className="sub">Recorded expenses</h3>
        {loading ? <p className="muted">Loading…</p> : expenses.length === 0 ? <p className="muted">No expenses in this range.</p> : (
          <div className="table-scroll">
            <table className="invoices-table expenses-table">
              <thead>
                <tr>
                  <th scope="col">Business</th>
                  <th scope="col">Date</th>
                  <th scope="col">Title</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="num">Amount</th>
                  <th scope="col">Note</th>
                  <th scope="col" className="expenses-actions-col"> </th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((row) => (
                  <tr key={row.id}>
                    <td><BusinessTypeBadge type={expenseBusinessType(row)} /></td>
                    <td className="muted">{formatShortDateTime(row.spentAt || row.createdAt)}</td>
                    <td><Link href={`/expenses/${row.id}`} className="team-row-link">{row.title}</Link></td>
                    <td>{expenseCategoryLabel(row.category)}</td>
                    <td className="num">{formatMoney(row.amount)}</td>
                    <td className="muted small expenses-note-cell">{row.note || '—'}</td>
                    <td className="expenses-actions-cell"><Link href={`/expenses/${row.id}`} className="inline-link">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
