'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/api.js'
import { useOrders } from '@/context/OrdersContext.jsx'
import BusinessTypeBadge from '@/components/BusinessTypeBadge.jsx'
import Pagination from '@/components/Pagination.jsx'

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
import { invoiceBusinessType } from '@/constants/businessTypes.js'
import {
  INVOICE_PAGE_SIZE,
  INVOICE_PAGE_SIZE_OPTIONS,
  INVOICE_RANGE_PRESETS,
  invoiceDateInputValue,
  parseInvoiceDateInput,
  toISOEnd,
  toISOStart,
} from '@/utils/invoices.js'

import Skeleton, { SkeletonTable } from '@/components/Skeleton.jsx'
import { useMoney, useLocale } from '@/context/BrandingContext.jsx'

export default function InvoicesListPage() {
  const money = useMoney()
  const { formatDateTime } = useLocale()
  const router = useRouter()
  const { menu } = useOrders()
  // A café with one counter has nothing to tell apart, so the filter and the
  // per-row badge that names it both disappear.
  const hasCounters = (menu.brands?.length ?? 0) > 1
  const [filterType, setFilterType] = useState('all')
  const [presetId, setPresetId] = useState('all')
  const [searchId, setSearchId] = useState('')
  const [customFrom, setCustomFrom] = useState(() => invoiceDateInputValue(new Date(Date.now() - 6 * 86400000)))
  const [customTo, setCustomTo] = useState(() => invoiceDateInputValue(new Date()))
  const [fromIso, setFromIso] = useState('')
  const [toIso, setToIso] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(INVOICE_PAGE_SIZE)
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

  useEffect(() => { setPage(1) }, [filterType, fromIso, toIso, presetId, searchId, pageSize])

  const load = useCallback(async () => {
    setError(''); setLoading(true)
    try {
      const params = { page, pageSize }
      if (fromIso) params.from = fromIso
      if (toIso) params.to = toIso
      if (filterType !== 'all') params.businessType = filterType
      if (searchId.trim()) params.search = searchId.trim()
      const res = await api.getInvoices(params)
      setInvoices(Array.isArray(res.invoices) ? res.invoices : [])
      setPagination({
        page: res.pagination?.page ?? page,
        pageSize: res.pagination?.pageSize ?? pageSize,
        total: res.pagination?.total ?? 0,
        totalPages: Math.max(1, res.pagination?.totalPages ?? 1),
      })
    } catch (e) {
      setError(e.message || 'Could not load invoices')
      setInvoices([])
      setPagination({ page: 1, pageSize, total: 0, totalPages: 1 })
    } finally {
      setLoading(false)
    }
  }, [filterType, fromIso, toIso, page, pageSize, searchId])

  useEffect(() => { void load() }, [load])

  const rangeSummary = useMemo(() => {
    if (presetId === 'all' || (!fromIso && !toIso)) return 'All invoices — no date filter applied'
    if (!fromIso || !toIso) return ''
    try { return `${formatDateTime(fromIso)} → ${formatDateTime(toIso)}` }
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
          Filter by date, or open any row for details.
        </p>

        <div className="invoices-search-row">
          <label className="invoices-search-label" htmlFor="invoice-id-search">Search by Invoice ID, Order # or Table</label>
          <div className="invoices-search-field">
            <input
              id="invoice-id-search"
              type="search"
              className="input invoices-search-input"
              placeholder="e.g. inv-4340, 12 or 4A"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              aria-label="Search invoices by ID, order number or table"
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

        {/* Heading and all, only where the café has counters to tell apart. */}
        {hasCounters ? (
          <>
            <h3 className="sub invoices-business-heading">Counter</h3>
            <div className="invoices-filter-tabs">
              <button type="button" className={filterType === 'all' ? 'primary sm' : 'ghost sm'} onClick={() => setFilterType('all')}>All</button>
              {menu.brands.map((b) => (
                <button key={b.id} type="button" className={filterType === b.slug ? 'primary sm' : 'ghost sm'} onClick={() => setFilterType(b.slug)}>{b.name}</button>
              ))}
            </div>
          </>
        ) : null}

        {error ? (
          <p className="banner error" role="alert">
            {error}{' '}
            <button type="button" className="inline-link-button" onClick={() => void load()}>Retry</button>
          </p>
        ) : null}

        {/* Only when there is something to count. With no invoices this line
            said "No invoices yet" directly above a second paragraph saying the
            same thing — the empty state below is the one that stays, because
            it also names the filter that is hiding everything. */}
        {loading || invoices.length ? (
          <div className="invoices-list-meta">
            {loading
              ? <Skeleton width="9rem" height="0.8rem" />
              : <p className="muted small">{pageSummary}</p>}
          </div>
        ) : null}

        {!loading && invoices.length === 0 ? (
          <p className="muted">
            {presetId === 'all' ? 'No invoices yet' : 'No invoices in this range'}
            {filterType !== 'all' ? ' for this business' : ''}.
          </p>
        ) : loading ? (
          <SkeletonTable
            label="Loading invoices…"
            rows={6}
            tableClassName="invoices-table"
            wrapClassName="invoices-table-wrap"
            columns={[
              { key: 'order', label: 'Order #' },
              ...(hasCounters ? [{ key: 'counter', label: 'Counter' }] : []),
              { key: 'invoice', label: 'Invoice' },
              { key: 'type', label: 'Type' },
              { key: 'date', label: 'Date' },
              { key: 'total', label: 'Total', num: true },
              { key: 'discount', label: 'Discount', num: true },
              { key: 'status', label: 'Status' },
            ]}
          />
        ) : (
          <div className="table-scroll invoices-table-wrap">
            <table className="invoices-table table-cards">
              <thead>
                  <tr>
                    <th scope="col">Order #</th>
                    {hasCounters ? <th scope="col">Counter</th> : null}
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
                    <td className="invoices-table-shift-num cell-card-title">{inv.shiftNumber != null ? `#${inv.shiftNumber}` : <span className="muted">—</span>}</td>
                    {hasCounters ? <td data-label="Counter"><BusinessTypeBadge type={invoiceBusinessType(inv)} /></td> : null}
                    <td className="invoices-table-id" data-label="Invoice">{inv.id}</td>
                    <td data-label="Type">
                      <span className="inv-badge-group">
                        <OrderTypeBadge type={inv.orderType} />
                        {inv.tableNumber ? <span className="badge-table-number">🪑 {inv.tableNumber}</span> : null}
                      </span>
                    </td>
                    <td className="muted" data-label="Date">{formatDateTime(inv.createdAt)}</td>
                    <td className="num invoices-table-total" data-label="Total">{money(inv.total)}</td>
                    <td className="num invoices-table-discount" data-label="Discount">
                      {(() => {
                        const d = Array.isArray(inv.lines)
                          ? inv.lines.reduce((s, l) => s + (l.discount ?? 0), 0)
                          : 0
                        return d > 0
                          ? <span className="invoice-list-discount-badge">−{money(d)}</span>
                          : <span className="muted">—</span>
                      })()}
                    </td>
                    <td data-label="Status">
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

        {/* Nothing to page through, so no "rows per page" over an empty table. */}
        {!loading && invoices.length ? (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onChange={goToPage}
            pageSize={pageSize}
            pageSizeOptions={INVOICE_PAGE_SIZE_OPTIONS}
            onPageSizeChange={setPageSize}
          />
        ) : null}
      </section>
    </main>
  )
}
