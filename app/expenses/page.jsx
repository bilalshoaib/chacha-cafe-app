'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import { useOrders } from '@/context/OrdersContext.jsx'
import BusinessTypeBadge from '@/components/BusinessTypeBadge.jsx'
import { expenseBusinessType } from '@/constants/businessTypes.js'
import { EXPENSE_RANGE_PRESETS, expenseCategoryLabel, startOfMonth, toISOEnd, toISOStart } from '@/utils/expenses.js'

import { SkeletonTable } from '@/components/Skeleton.jsx'
import { useMoney, useLocale } from '@/context/BrandingContext.jsx'

export default function ExpensesListPage() {
  const money = useMoney()
  const { formatDateTime } = useLocale()
  const { menu } = useOrders()
  // A café with one counter has nothing to tell apart, so the filter and the
  // per-row badge that names it both disappear.
  const hasCounters = (menu.brands?.length ?? 0) > 1
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
    try { return `${formatDateTime(fromIso)} → ${formatDateTime(toIso)}` }
    catch { return '' }
  }, [presetId, fromIso, toIso])

  return (
    <main className="expenses-page">
      <div className="expenses-head">
        <div>
          <h2>Expenses</h2>
          <p className="muted small">Operating costs by date.</p>
        </div>
        <div className="expenses-head-actions row">
          <Link href="/expenses/new" className="primary sm">Add expense</Link>
          <Link href="/orders" className="ghost sm">← Take order</Link>
        </div>
      </div>

      <div className="list-filter-group">
        <div className="list-filter-label">Date range</div>
        <div className="filter-chip-row">
          {EXPENSE_RANGE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`filter-chip${presetId === p.id ? ' active' : ''}`}
              onClick={() => setPresetId(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {rangeSummary ? <p className="muted small expenses-range-line">{rangeSummary}</p> : null}
      </div>

      {/* Heading and all, only where the café has counters to tell apart. */}
      {hasCounters ? (
        <div className="list-filter-group">
          <div className="list-filter-label">Counter</div>
          <div className="filter-chip-row">
            <button
              type="button"
              className={`filter-chip${filterType === 'all' ? ' active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              All
            </button>
            {menu.brands.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`filter-chip${filterType === b.slug ? ' active' : ''}`}
                onClick={() => setFilterType(b.slug)}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="banner error" role="alert">
          {error}{' '}
          <button type="button" className="inline-link-button" onClick={() => void load()}>Retry</button>
        </p>
      ) : null}

      <section className="card expenses-summary-card">
        <div className="expenses-summary-row">
          <span className="muted">Total in range</span>
          <strong className="expenses-total-value">{loading ? '…' : money(total)}</strong>
        </div>
      </section>

      <section className="card expenses-table-card">
        {loading ? (
          <SkeletonTable
            label="Loading expenses…"
            rows={5}
            tableClassName="invoices-table expenses-table"
            columns={[
              { key: 'title', label: 'Title' },
              ...(hasCounters ? [{ key: 'counter', label: 'Counter' }] : []),
              { key: 'date', label: 'Date' },
              { key: 'category', label: 'Category' },
              { key: 'amount', label: 'Amount', num: true },
              { key: 'note', label: 'Note' },
              { key: 'actions', label: ' ' },
            ]}
          />
        ) : expenses.length === 0 ? <p className="muted">No expenses in this range.</p> : (
          <div className="table-scroll">
            <table className="invoices-table expenses-table table-cards">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  {hasCounters ? <th scope="col">Counter</th> : null}
                  <th scope="col">Date</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="num">Amount</th>
                  <th scope="col">Note</th>
                  <th scope="col" className="expenses-actions-col"> </th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((row) => (
                  <tr key={row.id}>
                    <td className="cell-card-title"><Link href={`/expenses/${row.id}`} className="team-row-link">{row.title}</Link></td>
                    {hasCounters ? <td data-label="Counter"><BusinessTypeBadge type={expenseBusinessType(row)} /></td> : null}
                    <td className="muted" data-label="Date">{formatDateTime(row.spentAt || row.createdAt)}</td>
                    <td data-label="Category">{expenseCategoryLabel(row.category)}</td>
                    <td className="num" data-label="Amount">{money(row.amount)}</td>
                    <td className="muted small expenses-note-cell" data-label="Note">{row.note || '—'}</td>
                    <td className="expenses-actions-cell cell-card-action"><Link href={`/expenses/${row.id}`} className="inline-link">View</Link></td>
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
