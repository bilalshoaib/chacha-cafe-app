'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/api.js'
import BusinessTypeBadge from '@/components/BusinessTypeBadge.jsx'

const ORDER_TYPE_META = {
  dine_in:  { label: 'Dine In',  icon: '🍽️', cls: 'badge-order-type-dine' },
  takeaway: { label: 'Takeaway', icon: '🛍️', cls: 'badge-order-type-take' },
  delivery: { label: 'Delivery', icon: '🛵', cls: 'badge-order-type-delivery' },
}

function OrderTypeBadge({ type }) {
  if (!type) return <span className="muted">—</span>
  const meta = ORDER_TYPE_META[type] ?? { label: type, icon: '', cls: '' }
  return (
    <span className={`badge-order-type ${meta.cls}`}>
      {meta.icon} {meta.label}
    </span>
  )
}
import { BUSINESS_TYPES, invoiceBusinessType } from '@/constants/businessTypes.js'
import {
  INVOICE_PAGE_SIZE,
  INVOICE_RANGE_PRESETS,
  invoiceDateInputValue,
  parseInvoiceDateInput,
  toISOEnd,
  toISOStart,
} from '@/utils/invoices.js'
import { formatMoney, formatShortDateTime } from '@/utils/formatting.js'

export default function InvoicesListPage() {
  const router = useRouter()
  const [filterType, setFilterType] = useState('all')
  const [presetId, setPresetId] = useState('all')
  const [searchId, setSearchId] = useState('')
  const [customFrom, setCustomFrom] = useState(() => invoiceDateInputValue(new Date(Date.now() - 6 * 86400000)))
  const [customTo, setCustomTo] = useState(() => invoiceDateInputValue(new Date()))
  const [fromIso, setFromIso] = useState('')
  const [toIso, setToIso] = useState('')
  const [page, setPage] = useState(1)
  const [invoices, setInvoices] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pageSize: INVOICE_PAGE_SIZE, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const applyPreset = useCallback((id) => {
    const p = INVOICE_RANGE_PRESETS.find((x) => x.id === id)
    if (!p) return
    const { from, to } = p.range()
    setFromIso(from)
    setToIso(to)
  }, [])

  useEffect(() => {
    if (presetId === 'custom') {
      const a = parseInvoiceDateInput(customFrom)
      const b = parseInvoiceDateInput(customTo)
      if (a && b) { setFromIso(toISOStart(a)); setToIso(toISOEnd(b)) }
    } else {
      applyPreset(presetId)
    }
  }, [presetId, customFrom, customTo, applyPreset])

  useEffect(() => { setPage(1) }, [filterType, fromIso, toIso, presetId, searchId])

  const load = useCallback(async () => {
    setError(''); setLoading(true)
    try {
      const params = { page, pageSize: INVOICE_PAGE_SIZE }
      if (fromIso) params.from = fromIso
      if (toIso) params.to = toIso
      if (filterType !== 'all') params.businessType = filterType
      if (searchId.trim()) params.search = searchId.trim()
      const res = await api.getInvoices(params)
      setInvoices(Array.isArray(res.invoices) ? res.invoices : [])
      setPagination({
        page: res.pagination?.page ?? page,
        pageSize: res.pagination?.pageSize ?? INVOICE_PAGE_SIZE,
        total: res.pagination?.total ?? 0,
        totalPages: Math.max(1, res.pagination?.totalPages ?? 1),
      })
    } catch (e) {
      setError(e.message || 'Could not load invoices')
      setInvoices([])
      setPagination({ page: 1, pageSize: INVOICE_PAGE_SIZE, total: 0, totalPages: 1 })
    } finally {
      setLoading(false)
    }
  }, [filterType, fromIso, toIso, page, searchId])

  useEffect(() => { void load() }, [load])

  const rangeSummary = useMemo(() => {
    if (presetId === 'all' || (!fromIso && !toIso)) return 'All invoices — no date filter applied'
    if (!fromIso || !toIso) return ''
    try { return `${formatShortDateTime(fromIso)} → ${formatShortDateTime(toIso)}` }
    catch { return '' }
  }, [presetId, fromIso, toIso])

  const pageSummary = useMemo(() => {
    const { total, pageSize } = pagination
    if (total === 0) return presetId === 'all' ? 'No invoices yet' : 'No invoices in this range'
    const start = (pagination.page - 1) * pageSize + 1
    const end = Math.min(pagination.page * pageSize, total)
    return `Showing ${start}–${end} of ${total}`
  }, [pagination])

  function goToPage(next) {
    setPage(Math.max(1, Math.min(pagination.totalPages, next)))
  }

  return (
    <main className="invoices-list-page">
      <section className="card invoices-list-card">
        <h2>Invoices</h2>
        <p className="muted small invoices-list-lede">
          Chacha Cafe and Chacha Burger each have separate invoices. Filter by date and business, or open any row for details.
        </p>

        <div className="invoices-search-row">
          <label className="invoices-search-label" htmlFor="invoice-id-search">Search by Invoice ID</label>
          <div className="invoices-search-field">
            <input
              id="invoice-id-search"
              type="search"
              className="input invoices-search-input"
              placeholder="e.g. inv-cafe-abc123"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              aria-label="Search invoices by ID"
            />
            {searchId ? (
              <button type="button" className="ghost sm invoices-search-clear" onClick={() => setSearchId('')} aria-label="Clear search">✕</button>
            ) : null}
          </div>
        </div>

        <h3 className="sub">Date range</h3>
        <div className="invoices-date-presets">
          {INVOICE_RANGE_PRESETS.map((p) => (
            <button key={p.id} type="button" className={presetId === p.id ? 'primary sm' : 'ghost sm'} onClick={() => setPresetId(p.id)}>{p.label}</button>
          ))}
          <button type="button" className={presetId === 'custom' ? 'primary sm' : 'ghost sm'} onClick={() => setPresetId('custom')}>Custom</button>
        </div>
        {presetId === 'custom' ? (
          <div className="invoices-custom-dates">
            <label className="invoices-date-field">
              <span className="small muted">From</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label className="invoices-date-field">
              <span className="small muted">To</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </div>
        ) : null}
        {rangeSummary ? <p className="muted small invoices-range-line">{rangeSummary}</p> : null}

        <h3 className="sub invoices-business-heading">Business</h3>
        <div className="invoices-filter-tabs">
          <button type="button" className={filterType === 'all' ? 'primary sm' : 'ghost sm'} onClick={() => setFilterType('all')}>All</button>
          {BUSINESS_TYPES.map((bt) => (
            <button key={bt.id} type="button" className={filterType === bt.id ? 'primary sm' : 'ghost sm'} onClick={() => setFilterType(bt.id)}>{bt.shortLabel}</button>
          ))}
        </div>

        {error ? (
          <p className="banner error" role="alert">
            {error}{' '}
            <button type="button" className="inline-link-button" onClick={() => void load()}>Retry</button>
          </p>
        ) : null}

        <div className="invoices-list-meta">
          <p className="muted small">{loading ? 'Loading…' : pageSummary}</p>
          {pagination.totalPages > 1 ? (
            <div className="invoices-pagination">
              <button type="button" className="ghost sm" disabled={loading || pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)}>← Previous</button>
              <span className="muted small invoices-page-indicator">Page {pagination.page} of {pagination.totalPages}</span>
              <button type="button" className="ghost sm" disabled={loading || pagination.page >= pagination.totalPages} onClick={() => goToPage(pagination.page + 1)}>Next →</button>
            </div>
          ) : null}
        </div>

        {!loading && invoices.length === 0 ? (
          <p className="muted">
            {presetId === 'all' ? 'No invoices yet' : 'No invoices in this range'}
            {filterType !== 'all' ? ' for this business' : ''}.
          </p>
        ) : loading ? (
          <p className="muted">Loading invoices…</p>
        ) : (
          <div className="table-scroll invoices-table-wrap">
            <table className="invoices-table">
              <thead>
                  <tr>
                    <th scope="col">Business</th>
                    <th scope="col">Invoice</th>
                    <th scope="col">Type</th>
                    <th scope="col">Date</th>
                    <th scope="col" className="num">Total</th>
                    <th scope="col" className="num">Discount</th>
                    <th scope="col">Status</th>
                  </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="invoices-table-row"
                    tabIndex={0}
                    role="link"
                    aria-label={`Open invoice ${inv.id}`}
                    onClick={() => router.push(`/invoices/${inv.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        router.push(`/invoices/${inv.id}`)
                      }
                    }}
                  >
                    <td><BusinessTypeBadge type={invoiceBusinessType(inv)} /></td>
                    <td className="invoices-table-id">{inv.id}</td>
                    <td><OrderTypeBadge type={inv.orderType} /></td>
                    <td className="muted">{formatShortDateTime(inv.createdAt)}</td>
                    <td className="num invoices-table-total">{formatMoney(inv.total)}</td>
                    <td className="num invoices-table-discount">
                      {(() => {
                        const d = Array.isArray(inv.lines)
                          ? inv.lines.reduce((s, l) => s + (l.discount ?? 0), 0)
                          : 0
                        return d > 0
                          ? <span className="invoice-list-discount-badge">−{formatMoney(d)}</span>
                          : <span className="muted">—</span>
                      })()}
                    </td>
                    <td>
                      <span className="inv-badge-group invoices-table-badges">
                        {inv.paid ? <span className="badge-paid">Paid</span> : <span className="badge-unpaid">Unpaid</span>}
                        {inv.returned ? <span className="badge-returned">Returned</span> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && pagination.totalPages > 1 ? (
          <div className="invoices-pagination invoices-pagination-foot">
            <button type="button" className="ghost sm" disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)}>← Previous</button>
            <span className="muted small invoices-page-indicator">Page {pagination.page} of {pagination.totalPages}</span>
            <button type="button" className="ghost sm" disabled={pagination.page >= pagination.totalPages} onClick={() => goToPage(pagination.page + 1)}>Next →</button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
