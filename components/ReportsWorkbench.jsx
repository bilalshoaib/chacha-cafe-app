'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import BusinessTypeBadge from '@/components/BusinessTypeBadge.jsx'
import Pagination from '@/components/Pagination.jsx'
import ItemBreakdownPicker from '@/components/ItemBreakdownPicker.jsx'
import { expenseCategoryLabel } from '@/utils/expenses.js'
import { moneyFormatter, formatShortDateTime } from '@/utils/formatting.js'
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from '@/constants/locales.js'
import {
  tradingDay,
  tradingDayRange,
  tradingDayShortLabel,
  currentTradingDay,
  DEFAULT_DAY_START_HOUR,
  DEFAULT_DAY_END_HOUR,
} from '@/lib/tradingDay.js'
import { SkeletonTable } from '@/components/Skeleton.jsx'

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

/** As a "HH:MM" value for the custom range's <input type="time"> fields. */
const timeInputValue = (hour) => `${String(hour).padStart(2, '0')}:00`

/**
 * The presets, built for one café's trading day.
 *
 * A function rather than a constant, which is the whole point of this change:
 * "Today" used to mean 6 PM to 5 PM for everybody, because those two hours
 * were written into this file. They now come from the café being reported on,
 * so a breakfast place reads its own morning and the button says so.
 */
function presetsFor(hours) {
  const dayLabel = tradingDayShortLabel(hours)
  return [
    { id: 'last_day', label: `Last day (${dayLabel})`, range: () => tradingDayRange(-1, hours) },
    { id: 'today', label: `Today (${dayLabel})`, range: () => tradingDayRange(0, hours) },
    { id: '7d', label: 'Last 7 days', range: () => { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 6); return [toISOStart(start), toISOEnd(end)] } },
    { id: '30d', label: 'Last 30 days', range: () => { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 29); return [toISOStart(start), toISOEnd(end)] } },
    { id: 'this_month', label: 'This month', range: () => { const n = new Date(); return [toISOStart(startOfMonth(n)), toISOEnd(n)] } },
    { id: 'last_month', label: 'Last month', range: () => { const n = new Date(); const first = startOfMonth(new Date(n.getFullYear(), n.getMonth() - 1, 1)); const last = endOfMonth(first); return [toISOStart(first), toISOEnd(last)] } },
    { id: 'this_year', label: 'This year', range: () => { const n = new Date(); const start = new Date(n.getFullYear(), 0, 1); return [toISOStart(start), toISOEnd(n)] } },
  ]
}

const TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'sellers', label: 'Top sellers' },
  { id: 'expenses', label: 'Expenses' },
]

const INVOICE_PAGE_SIZE = 25

/**
 * A stat card per brand, built from whatever the café actually has.
 *
 * These used to be two entries hardcoded to Chacha's counters. A café with one
 * brand gets none of them — its net sales tile already says the same thing, and
 * showing a single "brand" column next to it would be inventing a distinction
 * the owner does not have.
 */
function brandStats(summary) {
  const brands = summary?.brands ?? []
  if (brands.length < 2) return []
  return brands.map((b) => ({
    key: `brand-${b.slug}`,
    label: b.name,
    value: (_s, money) => money(b.netSales),
    sub: (_s, _money) => `${b.invoiceCount} invoice${b.invoiceCount === 1 ? '' : 's'}`,
  }))
}

const SUMMARY_STATS = [
  { key: 'netSales', label: 'Net sales', value: (s, money) => money(s.netSalesTotal), sub: () => 'Excluding returns' },
  { key: 'invoiceCount', label: 'Invoices', value: (s) => s.invoiceCount, sub: () => 'In range' },
  { key: 'grossTotal', label: 'Gross total', value: (s, money) => money(s.grossTotal), sub: () => 'All invoices' },
  { key: 'returns', label: 'Returns', value: (s) => s.returnedCount, sub: (s, money) => `${money(s.returnedTotal)} refunded / voided` },
  { key: 'paidUnpaid', label: 'Paid vs unpaid', value: (s) => `${s.paidCount} / ${s.unpaidCount}`, sub: () => 'Non-returned only' },
  { key: 'delivery', label: '🛵 Delivery charges', value: (s, money) => money(s.deliveryChargesTotal), sub: (s) => `${s.deliveryOrderCount} delivery orders` },
  { key: 'exclDelivery', label: 'Sales excl. delivery', value: (s, money) => money(s.netSalesExclDelivery), sub: () => 'Net sales − delivery charges' },
  { key: 'expenses', label: 'Total expenses', value: (s, money) => money(s.expensesTotal), sub: (s) => `${s.expenseCount} entries · date spent` },
  { key: 'netAfterExpenses', label: 'Net after expenses', value: (s, money) => money(s.netAfterExpenses), sub: () => 'Sales excl. delivery − expenses' },
]

function dateInputValue(d) {
  const x = new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** A Date's wall-clock time as the "HH:MM" an <input type="time"> wants. */
function clockValue(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function parseDateInput(s) {
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/**
 * Moves a "YYYY-MM-DD" value by whole months, keeping the day of the month.
 *
 * The day is clamped to the target month's length so stepping back from the
 * 31st lands on the 28th/30th rather than rolling over into the next month,
 * which is what plain `setMonth` would do.
 */
function shiftMonths(dateStr, delta) {
  const d = parseDateInput(dateStr)
  if (!d) return dateStr
  const targetMonthStart = new Date(d.getFullYear(), d.getMonth() + delta, 1)
  const daysInTarget = endOfMonth(targetMonthStart).getDate()
  targetMonthStart.setDate(Math.min(d.getDate(), daysInTarget))
  return dateInputValue(targetMonthStart)
}

/**
 * Moves a "YYYY-MM-DD" value by whole days. Month and year ends look after
 * themselves — Date does the carrying.
 */
function shiftDays(dateStr, delta) {
  const d = parseDateInput(dateStr)
  if (!d) return dateStr
  d.setDate(d.getDate() + delta)
  return dateInputValue(d)
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
 * Default custom range: the business month *currently running*. It covers the
 * business days that open on the 6th through the 5th, and since the business
 * day opening on the 5th does not close until 5 PM on the 6th, the range ends
 * on the 6th — e.g. 6 Aug 6 PM → 6 Sep 5 PM. Ending it on the 5th would drop
 * the cycle's last night of trade.
 *
 * The cycle turns over when the café's day opens on the 6th, not at midnight,
 * so the anchor is the business day in progress rather than the calendar date.
 * Without that, the hours of the 6th before opening would default to a range
 * that has not started yet and the report would read zero.
 */
function defaultBusinessMonth(hours, now = new Date()) {
  const anchor = currentTradingDay(hours, now)
  const anchorMonth = anchor.getDate() >= 6 ? anchor.getMonth() : anchor.getMonth() - 1
  // Month -1 / +1 roll across the year boundary on their own.
  const from = new Date(anchor.getFullYear(), anchorMonth, 6)
  const to = new Date(anchor.getFullYear(), anchorMonth + 1, 6)
  return [dateInputValue(from), dateInputValue(to)]
}

function paymentLabel(method) {
  if (method === 'cash') return 'Cash'
  if (method === 'online') return 'Online / Card'
  return '—'
}
function businessLabel(type) {
  if (type === 'cafe') return 'Cafe'
  if (type === 'burger') return 'Burger'
  if (type === 'combined') return 'Combined (Cafe + Burger)'
  return type
}

function buildPdfHtml({ rangeLabel, summary, invoices, expenses, topSellers, sellerSort, businessFilter, paymentFilter, tenantName, money, formatDateTime }) {
  const filterNote = [
    businessFilter !== 'all' ? `Business: ${businessLabel(businessFilter)}` : '',
    paymentFilter !== 'all' ? `Payment: ${paymentLabel(paymentFilter)}` : '',
  ].filter(Boolean).join(' · ')

  const orderTypeLabels = { dine_in: 'Dine In', takeaway: 'Takeaway', delivery: 'Delivery' }
  const invoiceRows = invoices.map((inv) => `
    <tr>
      <td>${businessLabel(inv.businessType)}</td>
      <td>${inv.id}</td>
      <td>${formatDateTime(inv.createdAt)}</td>
      <td>${inv.orderType ? (orderTypeLabels[inv.orderType] ?? inv.orderType) : '—'}</td>
      <td style="text-align:right">${money(inv.total)}</td>
      <td style="text-align:right">${(inv.deliveryCharge ?? 0) > 0 ? money(inv.deliveryCharge) : '—'}</td>
      <td>${inv.returned ? 'Returned' : inv.paid ? 'Paid' : 'Unpaid'}</td>
      <td>${paymentLabel(inv.paymentMethod)}</td>
    </tr>`).join('')

  const sellerRows = topSellers.map((r, i) => `
    <tr>
      <td style="text-align:right">${i + 1}</td>
      <td>${r.label}</td>
      <td>${r.kind === 'deal' ? 'Deal' : 'Item'}</td>
      <td style="text-align:right">${r.qty}</td>
      <td style="text-align:right">${money(r.revenue)}</td>
      <td style="text-align:right">${r.orderCount}</td>
    </tr>`).join('')

  const expenseRows = expenses.map((ex) => `
    <tr>
      <td>${formatDateTime(ex.spentAt)}</td>
      <td>${ex.title || '—'}</td>
      <td>${businessLabel(ex.businessType)}</td>
      <td>${expenseCategoryLabel(ex.category)}</td>
      <td style="text-align:right">${money(ex.amount)}</td>
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
  <div class="stat"><span class="stat-label">Net Sales</span><span class="stat-value">${money(summary.netSalesTotal)}</span><span class="stat-sub">Excl. returns</span></div>
  <div class="stat"><span class="stat-label">Sales excl. delivery</span><span class="stat-value">${money(summary.netSalesExclDelivery ?? summary.netSalesTotal)}</span><span class="stat-sub">Net sales − delivery charges</span></div>
  <div class="stat"><span class="stat-label">Delivery charges</span><span class="stat-value">${money(summary.deliveryChargesTotal ?? 0)}</span><span class="stat-sub">${summary.deliveryOrderCount ?? 0} delivery orders</span></div>
  ${(summary.brands ?? []).length > 1 ? (summary.brands ?? []).map((b) => `<div class="stat"><span class="stat-label">${b.name}</span><span class="stat-value">${money(b.netSales)}</span><span class="stat-sub">${b.invoiceCount} invoices</span></div>`).join('') : ''}
  <div class="stat"><span class="stat-label">Invoices</span><span class="stat-value">${summary.invoiceCount}</span><span class="stat-sub">In range</span></div>
  <div class="stat"><span class="stat-label">Gross Total</span><span class="stat-value">${money(summary.grossTotal)}</span><span class="stat-sub">All invoices</span></div>
  <div class="stat"><span class="stat-label">Returns</span><span class="stat-value">${summary.returnedCount}</span><span class="stat-sub">${money(summary.returnedTotal)} refunded</span></div>
  <div class="stat"><span class="stat-label">Paid / Unpaid</span><span class="stat-value">${summary.paidCount} / ${summary.unpaidCount}</span><span class="stat-sub">Non-returned</span></div>
  <div class="stat"><span class="stat-label">Expenses</span><span class="stat-value">${money(summary.expensesTotal)}</span><span class="stat-sub">${summary.expenseCount} entries</span></div>
  <div class="stat"><span class="stat-label">Net after expenses</span><span class="stat-value">${money(summary.netAfterExpenses)}</span><span class="stat-sub">Sales excl. delivery − expenses</span></div>
</div>
<h2>Top selling items &amp; deals (by ${sellerSort === 'revenue' ? 'revenue' : 'quantity'})</h2>
${topSellers.length === 0 ? '<p style="color:#6b7280">No sales in this period.</p>' : `<table><thead><tr><th style="text-align:right">#</th><th>Item / Deal</th><th>Type</th><th style="text-align:right">Qty sold</th><th style="text-align:right">Revenue</th><th style="text-align:right">Orders</th></tr></thead><tbody>${sellerRows}</tbody></table>`}
<h2>Invoices (${invoices.length})</h2>
${invoices.length === 0 ? '<p style="color:#6b7280">No invoices match the selected filters.</p>' : `<table><thead><tr><th>Business</th><th>Invoice ID</th><th>Issued</th><th>Order type</th><th style="text-align:right">Total</th><th style="text-align:right">Delivery</th><th>Status</th><th>Payment</th></tr></thead><tbody>${invoiceRows}</tbody></table>`}
<h2>Expenses (${expenses.length})</h2>
${expenses.length === 0 ? '<p style="color:#6b7280">No expenses in this period.</p>' : `<table><thead><tr><th>Spent</th><th>Title</th><th>Business</th><th>Category</th><th style="text-align:right">Amount</th><th>Note</th></tr></thead><tbody>${expenseRows}</tbody></table>`}
<p class="footer">Generated ${new Date().toLocaleString()}${tenantName ? ` · ${tenantName}` : ''}</p>
</body>
</html>`
}

/**
 * The reports screen, for whoever is entitled to read the books.
 *
 * Two screens render this: a café owner opening their own reports from
 * Settings, and the platform owner opening a café's from the console. They are
 * the same screen because they must show the same figures — a second
 * implementation for the console is a second set of totals to disagree with
 * the customer's own.
 *
 * `tenantId` is what separates them. Absent, every request is scoped to the
 * caller's session, as it always was. Present, it names the café being looked
 * at from outside, and the server checks that the caller is the platform owner
 * before honouring it.
 */
export default function ReportsWorkbench({
  tenantId = null,
  tenantName = null,
  title = 'Sales reports',
  subtitle = null,
  backHref = '/settings',
  backLabel = '← Settings',
  // When this café's day opens and closes. The café's own screen reads them
  // from its branding, resolved on the server; the console passes the hours of
  // the café it is looking at, which are not the platform owner's own. Both
  // fall back to the product default, so a screen that renders before its
  // tenant has arrived shows a sane range rather than an empty one.
  dayStartHour = DEFAULT_DAY_START_HOUR,
  dayEndHour = DEFAULT_DAY_END_HOUR,
  // What this café trades and reads in. Props rather than the hook, for the
  // same reason the hours are: the console renders this against a café that is
  // not the one the signed-in session belongs to, and reading the context
  // there would print a Texas café's takings in rupees.
  currency = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE,
}) {
  const money = useMemo(() => moneyFormatter({ locale, currency }), [locale, currency])
  const formatDateTime = useCallback((v) => formatShortDateTime(v, { locale }), [locale])
  // Rows link to the invoice and expense pages, which live inside the café.
  // The platform owner reading from the console has no tenant of their own to
  // open them against, so there they are plain text — a link that lands on a
  // 404 is worse than no link.
  const linkRows = !tenantId
  const hours = useMemo(() => tradingDay({ dayStartHour, dayEndHour }), [dayStartHour, dayEndHour])
  const presets = useMemo(() => presetsFor(hours), [hours])
  const [presetId, setPresetId] = useState('today')
  // Custom defaults to the trading day's boundaries, not midnight — a range
  // that started at 00:00 cut the previous evening's shift in half and counted
  // the tail of it against the wrong day.
  const [customFrom, setCustomFrom] = useState(() => defaultBusinessMonth(hours)[0])
  const [customFromTime, setCustomFromTime] = useState(timeInputValue(hours.startHour))
  const [customTo, setCustomTo] = useState(() => defaultBusinessMonth(hours)[1])
  const [customToTime, setCustomToTime] = useState(timeInputValue(hours.endHour))
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

  /**
   * Steps the whole range, both ends together, by a day or by a month — so a
   * range of 6 Aug → 5 Sep becomes 6 Jul → 5 Aug, and last night becomes the
   * night before. The times are left alone, which keeps a stepped range on the
   * café's own opening and closing hours.
   *
   * It works from a preset as well as from a custom range, and that is the
   * point of it. "Last day" answers what happened yesterday, and the next
   * question is nearly always the day before that; before this, answering it
   * meant finding the Custom button and typing two dates. Pressing an arrow on
   * a preset converts the range that preset produced into a custom one and
   * steps that, so the arrows walk backwards from wherever you already are.
   *
   * The converted range lands on the minute, because that is the resolution
   * the custom range's time inputs work in — a preset that ran to the last
   * millisecond of the day now ends at 23:59.
   */
  const stepRange = useCallback((unit, delta) => {
    const move = unit === 'month' ? shiftMonths : shiftDays

    if (presetId === 'custom') {
      setCustomFrom((f) => move(f, delta))
      setCustomTo((t) => move(t, delta))
      return
    }

    if (!fromIso || !toIso) return
    const from = new Date(fromIso)
    const to = new Date(toIso)
    setCustomFrom(move(dateInputValue(from), delta))
    setCustomFromTime(clockValue(from))
    setCustomTo(move(dateInputValue(to), delta))
    setCustomToTime(clockValue(to))
    setPresetId('custom')
  }, [presetId, fromIso, toIso])

  const applyPreset = useCallback((id) => {
    const p = presets.find((x) => x.id === id)
    if (!p) return
    const [from, to] = p.range()
    setFromIso(from); setToIso(to)
  }, [presets])

  useEffect(() => {
    if (presetId === 'custom') {
      const from = buildISO(customFrom, customFromTime)
      const to = buildISO(customTo, customToTime)
      if (from && to) { setFromIso(from); setToIso(to) }
    } else { applyPreset(presetId) }
  }, [presetId, customFrom, customFromTime, customTo, customToTime, applyPreset])


  // Range + filters shared by every tab's request.
  const queryParams = useMemo(
    () => ({ from: fromIso, to: toIso, businessType: businessFilter, paymentMethod: paymentFilter, tenantId }),
    [fromIso, toIso, businessFilter, paymentFilter, tenantId],
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
    try { return `${formatDateTime(new Date(fromIso))} → ${formatDateTime(new Date(toIso))}` }
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
        money,
        formatDateTime,
        rangeLabel,
        summary: summaryRes.summary,
        invoices: invoiceRes.invoices,
        expenses: expenseRes.expenses,
        topSellers: sellerRes.topSellers,
        sellerSort, businessFilter, paymentFilter,
        tenantName,
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
    <main className="reports-page">
      <div className="reports-head">
        <div>
          <h2>{title}</h2>
          <p className="muted small">
            {subtitle ?? <>Invoice totals by issue date. <strong>Net sales</strong> excludes returned invoices. Super admin only.</>}
          </p>
        </div>
        <div className="reports-head-actions">
          <button type="button" className="primary sm" disabled={pdfLoading || !fromIso || !toIso} onClick={() => void downloadPdf()}>
            {pdfLoading ? 'Building PDF…' : 'Download PDF'}
          </button>
          <Link href={backHref} className="ghost sm">{backLabel}</Link>
        </div>
      </div>

      <section className="card reports-filters-card">
        <h3 className="sub">Date range</h3>
        <div className="reports-presets">
          {presets.map((p) => (
            <button key={p.id} type="button" className={presetId === p.id ? 'primary sm' : 'ghost sm'} onClick={() => setPresetId(p.id)}>
              {p.label}
            </button>
          ))}
          <button type="button" className={presetId === 'custom' ? 'primary sm' : 'ghost sm'} onClick={() => {
            if (presetId !== 'custom') {
              const [f, t] = defaultBusinessMonth(hours)
              setCustomFrom(f); setCustomTo(t)
              setCustomFromTime(timeInputValue(hours.startHour))
              setCustomToTime(timeInputValue(hours.endHour))
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

        {/* Outside the custom block on purpose. These used to appear only once
            somebody had opened Custom, which is the one place a person looking
            at yesterday and wanting the day before would never think to go. */}
        <div className="reports-range-steppers">
          {[
            { unit: 'day', label: 'day' },
            { unit: 'month', label: 'month' },
          ].map(({ unit, label }) => (
            <div
              key={unit}
              className="reports-month-step"
              role="group"
              aria-label={`Shift the range by a ${unit}`}
            >
              <button
                type="button"
                className="month-step-btn"
                onClick={() => stepRange(unit, -1)}
                aria-label={`Shift the range back one ${unit}`}
              >
                <span className="month-step-chevron" aria-hidden="true">‹</span>
                Prev
              </button>
              <span className="month-step-label" aria-hidden="true">{label}</span>
              <button
                type="button"
                className="month-step-btn"
                onClick={() => stepRange(unit, 1)}
                aria-label={`Shift the range forward one ${unit}`}
              >
                Next
                <span className="month-step-chevron" aria-hidden="true">›</span>
              </button>
            </div>
          ))}
        </div>

        <p className="muted small reports-range-line">{rangeLabel || (fromIso && toIso ? 'Loading range…' : null)}</p>

        <div className="reports-filter-row">
          <div className="reports-filter-group">
            <span className="reports-filter-label">Business</span>
            <div className="reports-filter-btns">
              {[{ id: 'all', label: 'All' }, ...(summary?.brands ?? []).map((b) => ({ id: b.slug, label: b.name }))].map((opt) => (
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
            {[SUMMARY_STATS[0], ...brandStats(summary), ...SUMMARY_STATS.slice(1)].map((stat) => (
              <article key={stat.key} className="card reports-stat-card">
                <span className="muted small reports-stat-label">{stat.label}</span>
                {loading ? (
                  <>
                    <span className="skeleton skeleton-value" />
                    <span className="skeleton skeleton-sub" />
                  </>
                ) : (
                  <>
                    <strong className="reports-stat-value">{stat.value(summary, money)}</strong>
                    <span className="muted small">{stat.sub(summary, money)}</span>
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
          {loading && !invoiceData ? (
            <SkeletonTable
              label="Loading invoices…"
              rows={5}
              tableClassName="staff-accounts-table reports-invoice-table"
              columns={[
                { key: 'business', label: 'Business' },
                { key: 'invoice', label: 'Invoice' },
                { key: 'issued', label: 'Issued' },
                { key: 'ordertype', label: 'Order type' },
                { key: 'total', label: 'Total', num: true },
                { key: 'delivery', label: 'Delivery', num: true },
                { key: 'status', label: 'Status' },
                { key: 'payment', label: 'Payment' },
              ]}
            />
          ) : !invoiceData || invoiceData.invoices.length === 0 ? (
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
                          <td>{linkRows ? <Link href={`/invoices/${inv.id}`} className="team-row-link">{inv.id}</Link> : inv.id}</td>
                          <td className="muted">{formatDateTime(inv.createdAt)}</td>
                          <td className="muted small">{inv.orderType ? (orderTypeLabels[inv.orderType] ?? inv.orderType) : '—'}</td>
                          <td className="num">{money(inv.total)}</td>
                          <td className="num muted small">{(inv.deliveryCharge ?? 0) > 0 ? money(inv.deliveryCharge) : '—'}</td>
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
                      <span className="reports-breakdown-money">{money(selectedItem.standaloneRevenue)}</span>
                      {breakdownProfit ? (
                        <span className={breakdownProfit.alone < 0 ? 'menu-margin-bad' : 'menu-margin-good'}>
                          {money(breakdownProfit.alone)} profit
                        </span>
                      ) : null}
                    </div>
                    <div className="reports-breakdown-stat">
                      <span className="muted small">Inside deals</span>
                      <strong>{selectedItem.inDealQty}</strong>
                      <span className="reports-breakdown-money">{money(selectedItem.inDealRevenue)}</span>
                      {breakdownProfit ? (
                        <span className={breakdownProfit.inDeals < 0 ? 'menu-margin-bad' : 'menu-margin-good'}>
                          {money(breakdownProfit.inDeals)} profit
                        </span>
                      ) : null}
                      <span className="muted small">{selectedItem.deals.length} deal{selectedItem.deals.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="reports-breakdown-stat reports-breakdown-total">
                      <span className="muted small">Total units</span>
                      <strong>{selectedItem.totalQty}</strong>
                      <span className="reports-breakdown-money">{money(selectedItem.totalRevenue)}</span>
                      {breakdownProfit ? (
                        <span className={breakdownProfit.total < 0 ? 'menu-margin-bad' : 'menu-margin-good'}>
                          {money(breakdownProfit.total)} profit
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
                      ? ` Profit uses a cost of ${money(breakdownProfit.unitCost)} per unit.`
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
                              <td className="num">{money(d.revenue)}</td>
                              <td className="num">
                                {breakdownProfit ? (
                                  (() => {
                                    const p = Math.round((d.revenue - breakdownProfit.unitCost * d.qty) * 100) / 100
                                    return <span className={p < 0 ? 'menu-margin-bad' : 'menu-margin-good'}>{money(p)}</span>
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
                            <td className="num"><strong>{money(selectedItem.inDealRevenue)}</strong></td>
                            <td className="num">
                              {breakdownProfit
                                ? <strong className={breakdownProfit.inDeals < 0 ? 'menu-margin-bad' : 'menu-margin-good'}>{money(breakdownProfit.inDeals)}</strong>
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

          {loading && !sellers ? (
            <SkeletonTable
              label="Loading best sellers…"
              rows={5}
              tableClassName="staff-accounts-table reports-invoice-table"
              columns={[
                { key: 'rank', label: '#', num: true },
                { key: 'label', label: 'Item / Deal' },
                { key: 'type', label: 'Type' },
                { key: 'qty', label: 'Qty sold', num: true },
                { key: 'revenue', label: 'Revenue', num: true },
                { key: 'profit', label: 'Profit', num: true },
                { key: 'orders', label: 'Orders', num: true },
              ]}
            />
          ) : !sellers || sellers.length === 0 ? (
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
                      <td className="num">{money(row.revenue)}</td>
                      <td className="num">
                        {row.profit == null
                          ? <span className="muted" title="No cost price set for this item">—</span>
                          : <span className={row.profit < 0 ? 'menu-margin-bad' : 'menu-margin-good'}>{money(row.profit)}</span>}
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
          {loading && !expenseData ? (
            <SkeletonTable
              label="Loading expenses…"
              rows={5}
              tableClassName="staff-accounts-table reports-invoice-table reports-expense-table"
              columns={[
                { key: 'spent', label: 'Spent' },
                { key: 'title', label: 'Title' },
                { key: 'business', label: 'Business' },
                { key: 'category', label: 'Category' },
                { key: 'amount', label: 'Amount', num: true },
                { key: 'note', label: 'Note' },
              ]}
            />
          ) : !expenseData || expenseData.expenses.length === 0 ? (
            <p className="muted">No expenses with date spent in this period.</p>
          ) : (
            <div className="table-scroll">
              <table className="staff-accounts-table reports-invoice-table reports-expense-table">
                <thead><tr><th scope="col">Spent</th><th scope="col">Title</th><th scope="col">Business</th><th scope="col">Category</th><th scope="col" className="num">Amount</th><th scope="col">Note</th></tr></thead>
                <tbody>
                  {expenseData.expenses.map((ex) => (
                    <tr key={ex.id}>
                      <td className="muted">{formatDateTime(ex.spentAt)}</td>
                      <td>{linkRows ? <Link href={`/expenses/${ex.id}`} className="team-row-link">{ex.title || '—'}</Link> : (ex.title || '—')}</td>
                      <td><BusinessTypeBadge type={ex.businessType ?? 'cafe'} /></td>
                      <td>{expenseCategoryLabel(ex.category)}</td>
                      <td className="num">{money(ex.amount)}</td>
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
  )
}
