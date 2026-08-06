'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import RequireSuperAdmin from '@/components/RequireSuperAdmin.jsx'
import BusinessTypeBadge from '@/components/BusinessTypeBadge.jsx'
import Pagination from '@/components/Pagination.jsx'
import ItemBreakdownPicker from '@/components/ItemBreakdownPicker.jsx'
import { expenseCategoryLabel } from '@/utils/expenses.js'
import { formatMoney, formatShortDateTime } from '@/utils/formatting.js'

function toISOStart(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.toISOString()
}

function toISOEnd(d) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x.toISOString()
}

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }

/** A business day opens at 6 PM and closes at 5 PM the next day. */
const SHIFT_START_HOUR = 18
const SHIFT_END_HOUR = 17

/** As a "HH:MM" value for the custom range's <input type="time"> fields. */
const timeInputValue = (hour) => `${String(hour).padStart(2, '0')}:00`

/**
 * A business day runs from 6 PM to 5 PM the next day, matching the evening
 * shift. `dayOffset` picks which one: 0 is the day opening this evening, -1
 * is the one that opened yesterday evening.
 *
 * The end is derived from the start (not from `now`) so it is always exactly
 * one calendar day later, even across month, year and DST boundaries.
 */
function businessDayRange(dayOffset, now = new Date()) {
  const start = new Date(now)
  start.setDate(start.getDate() + dayOffset)
  start.setHours(SHIFT_START_HOUR, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  end.setHours(SHIFT_END_HOUR, 0, 0, 0)
  return [start.toISOString(), end.toISOString()]
}

const PRESETS = [
  { id: 'last_day', label: 'Last day (6 PM–5 PM)', range: () => businessDayRange(-1) },
  { id: 'today', label: 'Today (6 PM–5 PM)', range: () => businessDayRange(0) },
  { id: '7d', label: 'Last 7 days', range: () => { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 6); return [toISOStart(start), toISOEnd(end)] } },
  { id: '30d', label: 'Last 30 days', range: () => { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 29); return [toISOStart(start), toISOEnd(end)] } },
  { id: 'this_month', label: 'This month', range: () => { const n = new Date(); return [toISOStart(startOfMonth(n)), toISOEnd(n)] } },
  { id: 'last_month', label: 'Last month', range: () => { const n = new Date(); const first = startOfMonth(new Date(n.getFullYear(), n.getMonth() - 1, 1)); const last = endOfMonth(first); return [toISOStart(first), toISOEnd(last)] } },
  { id: 'this_year', label: 'This year', range: () => { const n = new Date(); const start = new Date(n.getFullYear(), 0, 1); return [toISOStart(start), toISOEnd(n)] } },
]

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'sellers', label: 'Top sellers' },
  { id: 'expenses', label: 'Expenses' },
]

const INVOICE_PAGE_SIZE = 25

const SUMMARY_STATS = [
  { key: 'netSales', label: 'Net sales', value: (s) => formatMoney(s.netSalesTotal), sub: () => 'Excluding returns' },
  { key: 'cafe', label: 'Chacha Cafe', value: (s) => formatMoney(s.cafeNetSales), sub: (s) => `${s.cafeInvoiceCount} invoices` },
  { key: 'burger', label: 'Chacha Burger', value: (s) => formatMoney(s.burgerNetSales), sub: (s) => `${s.burgerInvoiceCount} invoices` },
  { key: 'invoiceCount', label: 'Invoices', value: (s) => s.invoiceCount, sub: () => 'In range' },
  { key: 'grossTotal', label: 'Gross total', value: (s) => formatMoney(s.grossTotal), sub: () => 'All invoices' },
  { key: 'returns', label: 'Returns', value: (s) => s.returnedCount, sub: (s) => `${formatMoney(s.returnedTotal)} refunded / voided` },
  { key: 'paidUnpaid', label: 'Paid vs unpaid', value: (s) => `${s.paidCount} / ${s.unpaidCount}`, sub: () => 'Non-returned only' },
  { key: 'delivery', label: '🛵 Delivery charges', value: (s) => formatMoney(s.deliveryChargesTotal), sub: (s) => `${s.deliveryOrderCount} delivery orders` },
  { key: 'exclDelivery', label: 'Sales excl. delivery', value: (s) => formatMoney(s.netSalesExclDelivery), sub: () => 'Net sales − delivery charges' },
  { key: 'expenses', label: 'Total expenses', value: (s) => formatMoney(s.expensesTotal), sub: (s) => `${s.expenseCount} entries · date spent` },
  { key: 'netAfterExpenses', label: 'Net after expenses', value: (s) => formatMoney(s.netAfterExpenses), sub: () => 'Sales excl. delivery − expenses' },
]

function dateInputValue(d) {
  const x = new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDateInput(s) {
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

// Build an ISO string from a date string ("YYYY-MM-DD") + time string ("HH:MM").
function buildISO(dateStr, timeStr) {
  const d = parseDateInput(dateStr)
  if (!d) return null
  const [h, m] = (timeStr || '00:00').split(':').map(Number)
  d.setHours(h || 0, m || 0, 0, 0)
  return d.toISOString()
}

/**
 * Default custom range: the business month *currently running*, which goes
 * from the 6th of one month to the 5th of the next.
 *
 * On the 1st–5th that cycle opened on the 6th of the previous month, so the
 * range has to reach backwards — otherwise the report would default to a
 * period that hasn't started yet and show nothing.
 */
function defaultBusinessMonth(now = new Date()) {
  const anchorMonth = now.getDate() >= 6 ? now.getMonth() : now.getMonth() - 1
  // Month -1 rolls back to December of the previous year on its own.
  const from = new Date(now.getFullYear(), anchorMonth, 6)
  const to = new Date(now.getFullYear(), anchorMonth + 1, 5)
  return [dateInputValue(from), dateInputValue(to)]
}

function paymentLabel(method) {
  if (method === 'cash') return 'Cash'
  if (method === 'online') return 'Online / Card'
  return '—'
}
function businessLabel(type) {
  if (type === 'cafe') return 'Chacha Cafe'
  if (type === 'burger') return 'Chacha Burger'
  if (type === 'combined') return 'Combined (Cafe + Burger)'
  return type
}

function buildPdfHtml({ rangeLabel, summary, invoices, expenses, topSellers, sellerSort, businessFilter, paymentFilter }) {
  const filterNote = [
    businessFilter !== 'all' ? `Business: ${businessLabel(businessFilter)}` : '',
    paymentFilter !== 'all' ? `Payment: ${paymentLabel(paymentFilter)}` : '',
  ].filter(Boolean).join(' · ')

  const orderTypeLabels = { dine_in: 'Dine In', takeaway: 'Takeaway', delivery: 'Delivery' }
  const invoiceRows = invoices.map((inv) => `
    <tr>
      <td>${businessLabel(inv.businessType)}</td>
      <td>${inv.id}</td>
      <td>${formatShortDateTime(inv.createdAt)}</td>
      <td>${inv.orderType ? (orderTypeLabels[inv.orderType] ?? inv.orderType) : '—'}</td>
      <td style="text-align:right">${formatMoney(inv.total)}</td>
      <td style="text-align:right">${(inv.deliveryCharge ?? 0) > 0 ? formatMoney(inv.deliveryCharge) : '—'}</td>
      <td>${inv.returned ? 'Returned' : inv.paid ? 'Paid' : 'Unpaid'}</td>
      <td>${paymentLabel(inv.paymentMethod)}</td>
    </tr>`).join('')

  const sellerRows = topSellers.map((r, i) => `
    <tr>
      <td style="text-align:right">${i + 1}</td>
      <td>${r.label}</td>
      <td>${r.kind === 'deal' ? 'Deal' : 'Item'}</td>
      <td style="text-align:right">${r.qty}</td>
      <td style="text-align:right">${formatMoney(r.revenue)}</td>
      <td style="text-align:right">${r.orderCount}</td>
    </tr>`).join('')

  const expenseRows = expenses.map((ex) => `
    <tr>
      <td>${formatShortDateTime(ex.spentAt)}</td>
      <td>${ex.title || '—'}</td>
      <td>${businessLabel(ex.businessType)}</td>
      <td>${expenseCategoryLabel(ex.category)}</td>
      <td style="text-align:right">${formatMoney(ex.amount)}</td>
      <td>${ex.note?.trim() || '—'}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Sales Report — ${rangeLabel}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; font-size: 12px; color: #111; padding: 24px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 14px; margin: 20px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  p.sub { color: #666; font-size: 11px; margin-bottom: 16px; }
  .stats { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .stat { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; min-width: 130px; }
  .stat-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
  .stat-value { font-size: 18px; font-weight: 700; display: block; margin: 2px 0; }
  .stat-sub { font-size: 10px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f9fafb; text-align: left; padding: 6px 8px; border-bottom: 2px solid #e5e7eb; font-weight: 600; }
  td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
  tr:last-child td { border-bottom: none; }
  .footer { margin-top: 24px; color: #9ca3af; font-size: 10px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style>
</head>
<body>
<h1>Sales Report</h1>
<p class="sub">${rangeLabel}${filterNote ? ` · Filtered by: ${filterNote}` : ''}</p>
<div class="stats">
  <div class="stat"><span class="stat-label">Net Sales</span><span class="stat-value">${formatMoney(summary.netSalesTotal)}</span><span class="stat-sub">Excl. returns</span></div>
  <div class="stat"><span class="stat-label">Sales excl. delivery</span><span class="stat-value">${formatMoney(summary.netSalesExclDelivery ?? summary.netSalesTotal)}</span><span class="stat-sub">Net sales − delivery charges</span></div>
  <div class="stat"><span class="stat-label">Delivery charges</span><span class="stat-value">${formatMoney(summary.deliveryChargesTotal ?? 0)}</span><span class="stat-sub">${summary.deliveryOrderCount ?? 0} delivery orders</span></div>
  <div class="stat"><span class="stat-label">Chacha Cafe</span><span class="stat-value">${formatMoney(summary.cafeNetSales)}</span><span class="stat-sub">${summary.cafeInvoiceCount} invoices</span></div>
  <div class="stat"><span class="stat-label">Chacha Burger</span><span class="stat-value">${formatMoney(summary.burgerNetSales)}</span><span class="stat-sub">${summary.burgerInvoiceCount} invoices</span></div>
  <div class="stat"><span class="stat-label">Invoices</span><span class="stat-value">${summary.invoiceCount}</span><span class="stat-sub">In range</span></div>
  <div class="stat"><span class="stat-label">Gross Total</span><span class="stat-value">${formatMoney(summary.grossTotal)}</span><span class="stat-sub">All invoices</span></div>
  <div class="stat"><span class="stat-label">Returns</span><span class="stat-value">${summary.returnedCount}</span><span class="stat-sub">${formatMoney(summary.returnedTotal)} refunded</span></div>
  <div class="stat"><span class="stat-label">Paid / Unpaid</span><span class="stat-value">${summary.paidCount} / ${summary.unpaidCount}</span><span class="stat-sub">Non-returned</span></div>
  <div class="stat"><span class="stat-label">Expenses</span><span class="stat-value">${formatMoney(summary.expensesTotal)}</span><span class="stat-sub">${summary.expenseCount} entries</span></div>
  <div class="stat"><span class="stat-label">Net after expenses</span><span class="stat-value">${formatMoney(summary.netAfterExpenses)}</span><span class="stat-sub">Sales excl. delivery − expenses</span></div>
</div>
<h2>Top selling items &amp; deals (by ${sellerSort === 'revenue' ? 'revenue' : 'quantity'})</h2>
${topSellers.length === 0 ? '<p style="color:#6b7280">No sales in this period.</p>' : `<table><thead><tr><th style="text-align:right">#</th><th>Item / Deal</th><th>Type</th><th style="text-align:right">Qty sold</th><th style="text-align:right">Revenue</th><th style="text-align:right">Orders</th></tr></thead><tbody>${sellerRows}</tbody></table>`}
<h2>Invoices (${invoices.length})</h2>
${invoices.length === 0 ? '<p style="color:#6b7280">No invoices match the selected filters.</p>' : `<table><thead><tr><th>Business</th><th>Invoice ID</th><th>Issued</th><th>Order type</th><th style="text-align:right">Total</th><th style="text-align:right">Delivery</th><th>Status</th><th>Payment</th></tr></thead><tbody>${invoiceRows}</tbody></table>`}
<h2>Expenses (${expenses.length})</h2>
${expenses.length === 0 ? '<p style="color:#6b7280">No expenses in this period.</p>' : `<table><thead><tr><th>Spent</th><th>Title</th><th>Business</th><th>Category</th><th style="text-align:right">Amount</th><th>Note</th></tr></thead><tbody>${expenseRows}</tbody></table>`}
<p class="footer">Generated ${new Date().toLocaleString()} · Chacha Burger Cafe</p>
</body>
</html>`
}

export default function ReportsPage() {
  const [presetId, setPresetId] = useState('today')
  // Custom defaults to the shift boundaries, not midnight — a range that
  // started at 00:00 cut the previous evening's shift in half and counted the
  // tail of it against the wrong day.
  const [customFrom, setCustomFrom] = useState(() => defaultBusinessMonth()[0])
  const [customFromTime, setCustomFromTime] = useState(timeInputValue(SHIFT_START_HOUR))
  const [customTo, setCustomTo] = useState(() => defaultBusinessMonth()[1])
  const [customToTime, setCustomToTime] = useState(timeInputValue(SHIFT_END_HOUR))
  const [fromIso, setFromIso] = useState('')
  const [toIso, setToIso] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [businessFilter, setBusinessFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [sellerSort, setSellerSort] = useState('qty')
  const [tab, setTab] = useState('summary')
  const [reloadKey, setReloadKey] = useState(0)
  // One slice of state per tab — each is filled by its own endpoint.
  const [summary, setSummary] = useState(null)
  const [invoiceData, setInvoiceData] = useState(null)
  const [invoicePage, setInvoicePage] = useState(1)
  const [sellers, setSellers] = useState(null)
  const [sellerItems, setSellerItems] = useState([])
  const [breakdownItemId, setBreakdownItemId] = useState('')
  const [expenseData, setExpenseData] = useState(null)

  const applyPreset = useCallback((id) => {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    const [from, to] = p.range()
    setFromIso(from); setToIso(to)
  }, [])

  useEffect(() => {
    if (presetId === 'custom') {
      const from = buildISO(customFrom, customFromTime)
      const to = buildISO(customTo, customToTime)
      if (from && to) { setFromIso(from); setToIso(to) }
    } else { applyPreset(presetId) }
  }, [presetId, customFrom, customFromTime, customTo, customToTime, applyPreset])

  // Range + filters shared by every tab's request.
  const queryParams = useMemo(
    () => ({ from: fromIso, to: toIso, businessType: businessFilter, paymentMethod: paymentFilter }),
    [fromIso, toIso, businessFilter, paymentFilter],
  )

  // Changing the range or filters invalidates the invoice page cursor.
  useEffect(() => { setInvoicePage(1) }, [fromIso, toIso, businessFilter, paymentFilter])

  // Only the visible tab is fetched, so opening the page costs one small request.
  useEffect(() => {
    if (!fromIso || !toIso) return
    let cancelled = false
    async function run() {
      setError(''); setLoading(true)
      try {
        if (tab === 'summary') {
          const res = await api.getReportSummary(queryParams)
          if (!cancelled) setSummary(res.summary)
        } else if (tab === 'invoices') {
          const res = await api.getReportInvoices({ ...queryParams, page: invoicePage, pageSize: INVOICE_PAGE_SIZE })
          if (!cancelled) setInvoiceData(res)
        } else if (tab === 'sellers') {
          const res = await api.getReportTopSellers({ ...queryParams, sort: sellerSort })
          if (!cancelled) { setSellers(res.topSellers); setSellerItems(res.items ?? []) }
        } else {
          const res = await api.getReportExpenses(queryParams)
          if (!cancelled) setExpenseData(res)
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load report')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [tab, queryParams, fromIso, toIso, invoicePage, sellerSort, reloadKey])

  const selectedItem = useMemo(
    () => sellerItems.find((i) => i.refId === breakdownItemId) ?? null,
    [sellerItems, breakdownItemId],
  )

  // Profit = revenue − (unit cost × units). Null when no cost is recorded for
  // the item, so the page can say "cost not set" rather than imply 100% profit.
  const breakdownProfit = useMemo(() => {
    const cost = selectedItem?.unitCost
    if (!selectedItem || cost == null) return null
    const r = (n) => Math.round(n * 100) / 100
    const alone = r(selectedItem.standaloneRevenue - cost * selectedItem.standaloneQty)
    const inDeals = r(selectedItem.inDealRevenue - cost * selectedItem.inDealQty)
    return { unitCost: cost, alone, inDeals, total: r(alone + inDeals) }
  }, [selectedItem])

  const rangeLabel = useMemo(() => {
    if (!fromIso || !toIso) return ''
    try { return `${formatShortDateTime(new Date(fromIso))} → ${formatShortDateTime(new Date(toIso))}` }
    catch { return '' }
  }, [fromIso, toIso])

  // The PDF spans every tab, so it pulls all four datasets on demand.
  async function downloadPdf() {
    if (!fromIso || !toIso) return
    setPdfLoading(true)
    setError('')
    try {
      const [summaryRes, invoiceRes, sellerRes, expenseRes] = await Promise.all([
        api.getReportSummary(queryParams),
        api.getReportInvoices({ ...queryParams, page: 1, pageSize: 200 }),
        api.getReportTopSellers({ ...queryParams, sort: sellerSort, limit: 200 }),
        api.getReportExpenses(queryParams),
      ])
      const html = buildPdfHtml({
        rangeLabel,
        summary: summaryRes.summary,
        invoices: invoiceRes.invoices,
        expenses: expenseRes.expenses,
        topSellers: sellerRes.topSellers,
        sellerSort, businessFilter, paymentFilter,
      })
      const win = window.open('', '_blank', 'width=900,height=700')
      if (!win) return
      win.document.write(html); win.document.close(); win.focus()
      setTimeout(() => { win.print() }, 300)
    } catch (e) {
      setError(e.message || 'Could not build the PDF')
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <RequireSuperAdmin>
      <main className="reports-page">
        <div className="reports-head">
          <div>
            <h2>Sales reports</h2>
            <p className="muted small">Invoice totals by issue date. <strong>Net sales</strong> excludes returned invoices. Super admin only.</p>
          </div>
          <div className="reports-head-actions">
            <button type="button" className="primary sm" disabled={pdfLoading || !fromIso || !toIso} onClick={() => void downloadPdf()}>
              {pdfLoading ? 'Building PDF…' : 'Download PDF'}
            </button>
            <Link href="/settings" className="ghost sm">← Settings</Link>
          </div>
        </div>

        <section className="card reports-filters-card">
          <h3 className="sub">Date range</h3>
          <div className="reports-presets">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={presetId === p.id ? 'primary sm' : 'ghost sm'} onClick={() => setPresetId(p.id)}>
                {p.label}
              </button>
            ))}
            <button type="button" className={presetId === 'custom' ? 'primary sm' : 'ghost sm'} onClick={() => {
              if (presetId !== 'custom') {
                const [f, t] = defaultBusinessMonth()
                setCustomFrom(f); setCustomTo(t)
                setCustomFromTime(timeInputValue(SHIFT_START_HOUR))
                setCustomToTime(timeInputValue(SHIFT_END_HOUR))
              }
              setPresetId('custom')
            }}>Custom</button>
          </div>
          {presetId === 'custom' ? (
            <div className="reports-custom-dates">
              <div className="reports-datetime-group">
                <label className="field reports-date-field">
                  <span>From date</span>
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                </label>
                <label className="field reports-date-field">
                  <span>Start time</span>
                  <input type="time" value={customFromTime} onChange={(e) => e.target.value && setCustomFromTime(e.target.value)} />
                </label>
              </div>
              <div className="reports-datetime-group">
                <label className="field reports-date-field">
                  <span>To date</span>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </label>
                <label className="field reports-date-field">
                  <span>End time</span>
                  <input type="time" value={customToTime} onChange={(e) => e.target.value && setCustomToTime(e.target.value)} />
                </label>
              </div>
            </div>
          ) : null}
          <p className="muted small reports-range-line">{rangeLabel || (fromIso && toIso ? 'Loading range…' : null)}</p>

          <div className="reports-filter-row">
            <div className="reports-filter-group">
              <span className="reports-filter-label">Business</span>
              <div className="reports-filter-btns">
                {[{ id: 'all', label: 'All' }, { id: 'cafe', label: 'Chacha Cafe' }, { id: 'burger', label: 'Chacha Burger' }].map((opt) => (
                  <button key={opt.id} type="button" className={businessFilter === opt.id ? 'primary sm' : 'ghost sm'} onClick={() => setBusinessFilter(opt.id)}>{opt.label}</button>
                ))}
              </div>
            </div>
            <div className="reports-filter-group">
              <span className="reports-filter-label">Payment method</span>
              <div className="reports-filter-btns">
                {[{ id: 'all', label: 'All' }, { id: 'cash', label: '💵 Cash' }, { id: 'online', label: '💳 Online / Card' }].map((opt) => (
                  <button key={opt.id} type="button" className={paymentFilter === opt.id ? 'primary sm' : 'ghost sm'} onClick={() => setPaymentFilter(opt.id)}>{opt.label}</button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="reports-tabs" role="tablist" aria-label="Report sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`reports-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error ? (
          <p className="banner error" role="alert">
            {error}{' '}
            <button type="button" className="inline-link-button" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
          </p>
        ) : null}

        {tab === 'summary' ? (
          loading || summary ? (
            <section className="reports-summary-grid">
              {SUMMARY_STATS.map((stat) => (
                <article key={stat.key} className="card reports-stat-card">
                  <span className="muted small reports-stat-label">{stat.label}</span>
                  {loading ? (
                    <>
                      <span className="skeleton skeleton-value" />
                      <span className="skeleton skeleton-sub" />
                    </>
                  ) : (
                    <>
                      <strong className="reports-stat-value">{stat.value(summary)}</strong>
                      <span className="muted small">{stat.sub(summary)}</span>
                    </>
                  )}
                </article>
              ))}
            </section>
          ) : null
        ) : null}

        {tab === 'invoices' ? (
          <section className="card reports-table-card">
            <h3 className="sub">Invoices in range{invoiceData ? ` (${invoiceData.pagination.total})` : ''}</h3>
            {loading && !invoiceData ? <p className="muted">Loading…</p> : !invoiceData || invoiceData.invoices.length === 0 ? (
              <p className="muted">No invoices match the selected filters.</p>
            ) : (
              <>
                <div className="table-scroll">
                  <table className="staff-accounts-table reports-invoice-table">
                    <thead><tr><th scope="col">Business</th><th scope="col">Invoice</th><th scope="col">Issued</th><th scope="col">Order type</th><th scope="col" className="num">Total</th><th scope="col" className="num">Delivery</th><th scope="col">Status</th><th scope="col">Payment</th></tr></thead>
                    <tbody>
                      {invoiceData.invoices.map((inv) => {
                        const orderTypeLabels = { dine_in: '🍽️ Dine In', takeaway: '🛍️ Takeaway', delivery: '🛵 Delivery' }
                        return (
                          <tr key={inv.id}>
                            <td><BusinessTypeBadge type={inv.businessType} /></td>
                            <td><Link href={`/invoices/${inv.id}`} className="team-row-link">{inv.id}</Link></td>
                            <td className="muted">{formatShortDateTime(inv.createdAt)}</td>
                            <td className="muted small">{inv.orderType ? (orderTypeLabels[inv.orderType] ?? inv.orderType) : '—'}</td>
                            <td className="num">{formatMoney(inv.total)}</td>
                            <td className="num muted small">{(inv.deliveryCharge ?? 0) > 0 ? formatMoney(inv.deliveryCharge) : '—'}</td>
                            <td>{inv.returned ? <span className="badge-role badge-role-returned">Returned</span> : inv.paid ? <span className="badge-role badge-role-super">Paid</span> : <span className="badge-role badge-role-staff">Unpaid</span>}</td>
                            <td className="muted small">{inv.paymentMethod === 'cash' ? '💵 Cash' : inv.paymentMethod === 'online' ? '💳 Online' : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={invoiceData.pagination.page}
                  totalPages={invoiceData.pagination.totalPages}
                  onChange={setInvoicePage}
                  disabled={loading}
                />
              </>
            )}
          </section>
        ) : null}

        {tab === 'sellers' ? (
          <section className="card reports-table-card">
            <div className="reports-sellers-head">
              <div>
                <h3 className="sub">Top selling items &amp; deals</h3>
                <p className="muted small">Line items across non-returned invoices in range.</p>
              </div>
              <div className="reports-filter-btns">
                <button type="button" className={sellerSort === 'qty' ? 'primary sm' : 'ghost sm'} onClick={() => setSellerSort('qty')}>By quantity</button>
                <button type="button" className={sellerSort === 'revenue' ? 'primary sm' : 'ghost sm'} onClick={() => setSellerSort('revenue')}>By revenue</button>
              </div>
            </div>

            {sellerItems.length > 0 ? (
              <div className="reports-item-breakdown">
                <div className="reports-item-select">
                  <span className="muted small">Break down an item</span>
                  <ItemBreakdownPicker
                    items={sellerItems}
                    value={breakdownItemId}
                    onChange={setBreakdownItemId}
                  />
                </div>
                {selectedItem ? (
                  <div className="reports-breakdown-panel">
                    <div className="reports-breakdown-stats">
                      <div className="reports-breakdown-stat">
                        <span className="muted small">Sold alone</span>
                        <strong>{selectedItem.standaloneQty}</strong>
                        <span className="reports-breakdown-money">{formatMoney(selectedItem.standaloneRevenue)}</span>
                        {breakdownProfit ? (
                          <span className={breakdownProfit.alone < 0 ? 'menu-margin-bad' : 'menu-margin-good'}>
                            {formatMoney(breakdownProfit.alone)} profit
                          </span>
                        ) : null}
                      </div>
                      <div className="reports-breakdown-stat">
                        <span className="muted small">Inside deals</span>
                        <strong>{selectedItem.inDealQty}</strong>
                        <span className="reports-breakdown-money">{formatMoney(selectedItem.inDealRevenue)}</span>
                        {breakdownProfit ? (
                          <span className={breakdownProfit.inDeals < 0 ? 'menu-margin-bad' : 'menu-margin-good'}>
                            {formatMoney(breakdownProfit.inDeals)} profit
                          </span>
                        ) : null}
                        <span className="muted small">{selectedItem.deals.length} deal{selectedItem.deals.length === 1 ? '' : 's'}</span>
                      </div>
                      <div className="reports-breakdown-stat reports-breakdown-total">
                        <span className="muted small">Total units</span>
                        <strong>{selectedItem.totalQty}</strong>
                        <span className="reports-breakdown-money">{formatMoney(selectedItem.totalRevenue)}</span>
                        {breakdownProfit ? (
                          <span className={breakdownProfit.total < 0 ? 'menu-margin-bad' : 'menu-margin-good'}>
                            {formatMoney(breakdownProfit.total)} profit
                          </span>
                        ) : null}
                        <span className="muted small">Alone + in deals</span>
                      </div>
                    </div>
                    <p className="muted small reports-breakdown-note">
                      A deal sells for less than its items would separately, so each item earns a share of what the
                      deal actually took — using the price you set for it inside that deal, or its menu price if you
                      haven’t set one. The shares add back up to the deal’s revenue.
                      {breakdownProfit
                        ? ` Profit uses a cost of ${formatMoney(breakdownProfit.unitCost)} per unit.`
                        : ' Set a cost price on this item under Menu items to see profit here.'}
                    </p>
                    {selectedItem.deals.length > 0 ? (
                      <div className="table-scroll">
                        <table className="staff-accounts-table reports-invoice-table">
                          <thead>
                            <tr>
                              <th scope="col">Sold inside deal</th>
                              <th scope="col" className="num">Units of this item</th>
                              <th scope="col" className="num">Revenue from this item</th>
                              <th scope="col" className="num">Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedItem.deals.map((d) => (
                              <tr key={d.label}>
                                <td>{d.label}</td>
                                <td className="num"><strong>{d.qty}</strong></td>
                                <td className="num">{formatMoney(d.revenue)}</td>
                                <td className="num">
                                  {breakdownProfit ? (
                                    (() => {
                                      const p = Math.round((d.revenue - breakdownProfit.unitCost * d.qty) * 100) / 100
                                      return <span className={p < 0 ? 'menu-margin-bad' : 'menu-margin-good'}>{formatMoney(p)}</span>
                                    })()
                                  ) : <span className="muted">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td><strong>Total from deals</strong></td>
                              <td className="num"><strong>{selectedItem.inDealQty}</strong></td>
                              <td className="num"><strong>{formatMoney(selectedItem.inDealRevenue)}</strong></td>
                              <td className="num">
                                {breakdownProfit
                                  ? <strong className={breakdownProfit.inDeals < 0 ? 'menu-margin-bad' : 'menu-margin-good'}>{formatMoney(breakdownProfit.inDeals)}</strong>
                                  : <span className="muted">—</span>}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : <p className="muted small">This item was never sold as part of a deal in this range.</p>}
                  </div>
                ) : null}
              </div>
            ) : null}

            {loading && !sellers ? <p className="muted">Loading…</p> : !sellers || sellers.length === 0 ? (
              <p className="muted">No sales in this period.</p>
            ) : (
              <div className="table-scroll">
                <table className="staff-accounts-table reports-invoice-table">
                  <thead><tr><th scope="col" className="num">#</th><th scope="col">Item / Deal</th><th scope="col">Type</th><th scope="col" className="num">Qty sold</th><th scope="col" className="num">Revenue</th><th scope="col" className="num">Profit</th><th scope="col" className="num">Orders</th></tr></thead>
                  <tbody>
                    {sellers.map((row, i) => (
                      <tr key={row.key}>
                        <td className="num muted">{i + 1}</td>
                        <td>{row.label}</td>
                        <td>{row.kind === 'deal' ? <span className="badge-role badge-role-super">Deal</span> : <span className="badge-role badge-role-staff">Item</span>}</td>
                        <td className="num"><strong>{row.qty}</strong></td>
                        <td className="num">{formatMoney(row.revenue)}</td>
                        <td className="num">
                          {row.profit == null
                            ? <span className="muted" title="No cost price set for this item">—</span>
                            : <span className={row.profit < 0 ? 'menu-margin-bad' : 'menu-margin-good'}>{formatMoney(row.profit)}</span>}
                        </td>
                        <td className="num muted small">{row.orderCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {tab === 'expenses' ? (
          <section className="card reports-table-card">
            <h3 className="sub">Expenses in range{expenseData ? ` (${expenseData.expenses.length})` : ''}</h3>
            {loading && !expenseData ? <p className="muted">Loading…</p> : !expenseData || expenseData.expenses.length === 0 ? (
              <p className="muted">No expenses with date spent in this period.</p>
            ) : (
              <div className="table-scroll">
                <table className="staff-accounts-table reports-invoice-table reports-expense-table">
                  <thead><tr><th scope="col">Spent</th><th scope="col">Title</th><th scope="col">Business</th><th scope="col">Category</th><th scope="col" className="num">Amount</th><th scope="col">Note</th></tr></thead>
                  <tbody>
                    {expenseData.expenses.map((ex) => (
                      <tr key={ex.id}>
                        <td className="muted">{formatShortDateTime(ex.spentAt)}</td>
                        <td><Link href={`/expenses/${ex.id}`} className="team-row-link">{ex.title || '—'}</Link></td>
                        <td><BusinessTypeBadge type={ex.businessType ?? 'cafe'} /></td>
                        <td>{expenseCategoryLabel(ex.category)}</td>
                        <td className="num">{formatMoney(ex.amount)}</td>
                        <td className="muted small reports-expense-note">{ex.note?.trim() ? ex.note : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </main>
    </RequireSuperAdmin>
  )
}
