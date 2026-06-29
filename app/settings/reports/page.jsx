'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import RequireSuperAdmin from '@/components/RequireSuperAdmin.jsx'
import BusinessTypeBadge from '@/components/BusinessTypeBadge.jsx'
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

const PRESETS = [
  { id: 'today', label: 'Today', range: () => { const n = new Date(); return [toISOStart(n), toISOEnd(n)] } },
  { id: '7d', label: 'Last 7 days', range: () => { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 6); return [toISOStart(start), toISOEnd(end)] } },
  { id: '30d', label: 'Last 30 days', range: () => { const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 29); return [toISOStart(start), toISOEnd(end)] } },
  { id: 'this_month', label: 'This month', range: () => { const n = new Date(); return [toISOStart(startOfMonth(n)), toISOEnd(n)] } },
  { id: 'last_month', label: 'Last month', range: () => { const n = new Date(); const first = startOfMonth(new Date(n.getFullYear(), n.getMonth() - 1, 1)); const last = endOfMonth(first); return [toISOStart(first), toISOEnd(last)] } },
  { id: 'this_year', label: 'This year', range: () => { const n = new Date(); const start = new Date(n.getFullYear(), 0, 1); return [toISOStart(start), toISOEnd(n)] } },
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

function roundMoney(n) { return Math.round(Number(n) * 100) / 100 }
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

function buildPdfHtml({ rangeLabel, summary, invoices, expenses, businessFilter, paymentFilter }) {
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
  <div class="stat"><span class="stat-label">Net after expenses</span><span class="stat-value">${formatMoney(summary.netAfterExpenses)}</span><span class="stat-sub">Net − expenses</span></div>
</div>
<h2>Invoices (${invoices.length})</h2>
${invoices.length === 0 ? '<p style="color:#6b7280">No invoices match the selected filters.</p>' : `<table><thead><tr><th>Business</th><th>Invoice ID</th><th>Issued</th><th>Order type</th><th style="text-align:right">Total</th><th style="text-align:right">Delivery</th><th>Status</th><th>Payment</th></tr></thead><tbody>${invoiceRows}</tbody></table>`}
<h2>Expenses (${expenses.length})</h2>
${expenses.length === 0 ? '<p style="color:#6b7280">No expenses in this period.</p>' : `<table><thead><tr><th>Spent</th><th>Title</th><th>Business</th><th>Category</th><th style="text-align:right">Amount</th><th>Note</th></tr></thead><tbody>${expenseRows}</tbody></table>`}
<p class="footer">Generated ${new Date().toLocaleString()} · Chacha Burger Cafe</p>
</body>
</html>`
}

export default function ReportsPage() {
  const [presetId, setPresetId] = useState('30d')
  const [customFrom, setCustomFrom] = useState(() => dateInputValue(new Date(Date.now() - 29 * 86400000)))
  const [customTo, setCustomTo] = useState(() => dateInputValue(new Date()))
  const [fromIso, setFromIso] = useState('')
  const [toIso, setToIso] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [businessFilter, setBusinessFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')

  const applyPreset = useCallback((id) => {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    const [from, to] = p.range()
    setFromIso(from); setToIso(to)
  }, [])

  useEffect(() => {
    if (presetId === 'custom') {
      const a = parseDateInput(customFrom); const b = parseDateInput(customTo)
      if (a && b) { setFromIso(toISOStart(a)); setToIso(toISOEnd(b)) }
    } else { applyPreset(presetId) }
  }, [presetId, customFrom, customTo, applyPreset])

  const fetchReport = useCallback(async () => {
    if (!fromIso || !toIso) return
    setError(''); setLoading(true)
    try { const res = await api.getInvoiceReport(fromIso, toIso); setData(res) }
    catch (e) { setError(e.message || 'Could not load report'); setData(null) }
    finally { setLoading(false) }
  }, [fromIso, toIso])

  useEffect(() => { if (fromIso && toIso) void fetchReport() }, [fromIso, toIso, fetchReport])

  const rangeLabel = useMemo(() => {
    if (!data) return ''
    try { const a = new Date(data.from); const b = new Date(data.to); return `${formatShortDateTime(a)} → ${formatShortDateTime(b)}` }
    catch { return '' }
  }, [data])

  const filteredInvoices = useMemo(() => {
    if (!data?.invoices) return []
    let list = data.invoices
    if (businessFilter !== 'all') {
      // Combined invoices contain items from both businesses — include them in either filter
      list = list.filter((inv) => inv.businessType === businessFilter || inv.businessType === 'combined')
    }
    if (paymentFilter !== 'all') list = list.filter((inv) => inv.paymentMethod === paymentFilter)
    return list
  }, [data, businessFilter, paymentFilter])

  const filteredExpenses = useMemo(() => {
    if (!data?.expenses) return []
    if (businessFilter === 'all') return data.expenses
    return data.expenses.filter((ex) => (ex.businessType ?? 'cafe') === businessFilter)
  }, [data, businessFilter])

  const filteredSummary = useMemo(() => {
    const allInvoices = data?.invoices ?? []
    const paymentList = paymentFilter !== 'all' ? allInvoices.filter((inv) => inv.paymentMethod === paymentFilter) : allInvoices
    let grossTotal = 0, returnedCount = 0, returnedTotal = 0, paidCount = 0, unpaidCount = 0
    let cafeNetSales = 0, burgerNetSales = 0, cafeInvoiceCount = 0, burgerInvoiceCount = 0
    let deliveryChargesTotal = 0, deliveryOrderCount = 0
    for (const inv of paymentList) {
      const total = inv.total ?? 0; grossTotal += total
      if (inv.returned) { returnedCount++; returnedTotal += total }
      else {
        const cafePortion = inv.cafePortion ?? (inv.businessType === 'cafe' ? total : 0)
        const burgerPortion = inv.burgerPortion ?? (inv.businessType === 'burger' ? total : 0)
        cafeNetSales += cafePortion; burgerNetSales += burgerPortion
        if (inv.businessType === 'burger') burgerInvoiceCount++
        else if (inv.businessType === 'cafe') cafeInvoiceCount++
        else { cafeInvoiceCount++; burgerInvoiceCount++ } // combined: counted in both
        if (inv.paid) paidCount++; else unpaidCount++
        const dc = inv.deliveryCharge ?? 0
        if (dc > 0) { deliveryChargesTotal += dc; deliveryOrderCount++ }
      }
    }
    const netSalesTotal = businessFilter === 'cafe' ? cafeNetSales : businessFilter === 'burger' ? burgerNetSales : roundMoney(cafeNetSales + burgerNetSales)
    const netSalesExclDelivery = roundMoney(netSalesTotal - deliveryChargesTotal)
    let expensesTotal = 0
    for (const ex of filteredExpenses) expensesTotal += ex.amount ?? 0
    return {
      invoiceCount: filteredInvoices.length, grossTotal: roundMoney(grossTotal),
      returnedCount, returnedTotal: roundMoney(returnedTotal), netSalesTotal: roundMoney(netSalesTotal),
      netSalesExclDelivery,
      cafeNetSales: roundMoney(cafeNetSales), burgerNetSales: roundMoney(burgerNetSales),
      cafeInvoiceCount, burgerInvoiceCount, paidCount, unpaidCount,
      deliveryChargesTotal: roundMoney(deliveryChargesTotal), deliveryOrderCount,
      expensesTotal: roundMoney(expensesTotal), expenseCount: filteredExpenses.length,
      netAfterExpenses: roundMoney(netSalesTotal - expensesTotal),
    }
  }, [data, businessFilter, paymentFilter, filteredInvoices, filteredExpenses])

  function downloadPdf() {
    if (!data) return
    const html = buildPdfHtml({ rangeLabel, summary: filteredSummary, invoices: filteredInvoices, expenses: filteredExpenses, businessFilter, paymentFilter })
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return
    win.document.write(html); win.document.close(); win.focus()
    setTimeout(() => { win.print() }, 300)
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
            {data ? <button type="button" className="primary sm" onClick={downloadPdf}>Download PDF</button> : null}
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
            <button type="button" className={presetId === 'custom' ? 'primary sm' : 'ghost sm'} onClick={() => setPresetId('custom')}>Custom</button>
          </div>
          {presetId === 'custom' ? (
            <div className="reports-custom-dates">
              <label className="field reports-date-field"><span>From</span><input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></label>
              <label className="field reports-date-field"><span>To</span><input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></label>
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

        {error ? (
          <p className="banner error" role="alert">
            {error}{' '}
            <button type="button" className="inline-link-button" onClick={() => void fetchReport()}>Retry</button>
          </p>
        ) : null}

        {loading && !data ? <p className="muted">Loading…</p> : null}

        {data ? (
          <>
            <section className="reports-summary-grid">
              <article className="card reports-stat-card"><span className="muted small reports-stat-label">Net sales</span><strong className="reports-stat-value">{formatMoney(filteredSummary.netSalesTotal)}</strong><span className="muted small">Excluding returns</span></article>
              <article className="card reports-stat-card"><span className="muted small reports-stat-label">Chacha Cafe</span><strong className="reports-stat-value">{formatMoney(filteredSummary.cafeNetSales)}</strong><span className="muted small">{filteredSummary.cafeInvoiceCount} invoices</span></article>
              <article className="card reports-stat-card"><span className="muted small reports-stat-label">Chacha Burger</span><strong className="reports-stat-value">{formatMoney(filteredSummary.burgerNetSales)}</strong><span className="muted small">{filteredSummary.burgerInvoiceCount} invoices</span></article>
              <article className="card reports-stat-card"><span className="muted small reports-stat-label">Invoices</span><strong className="reports-stat-value">{filteredSummary.invoiceCount}</strong><span className="muted small">In range</span></article>
              <article className="card reports-stat-card"><span className="muted small reports-stat-label">Gross total</span><strong className="reports-stat-value">{formatMoney(filteredSummary.grossTotal)}</strong><span className="muted small">All invoices</span></article>
              <article className="card reports-stat-card"><span className="muted small reports-stat-label">Returns</span><strong className="reports-stat-value">{filteredSummary.returnedCount}</strong><span className="muted small">{formatMoney(filteredSummary.returnedTotal)} refunded / voided</span></article>
              <article className="card reports-stat-card"><span className="muted small reports-stat-label">Paid vs unpaid</span><strong className="reports-stat-value">{filteredSummary.paidCount} / {filteredSummary.unpaidCount}</strong><span className="muted small">Non-returned only</span></article>
              <article className="card reports-stat-card"><span className="muted small reports-stat-label">🛵 Delivery charges</span><strong className="reports-stat-value">{formatMoney(filteredSummary.deliveryChargesTotal)}</strong><span className="muted small">{filteredSummary.deliveryOrderCount} delivery orders</span></article>
              <article className="card reports-stat-card"><span className="muted small reports-stat-label">Sales excl. delivery</span><strong className="reports-stat-value">{formatMoney(filteredSummary.netSalesExclDelivery)}</strong><span className="muted small">Net sales − delivery charges</span></article>
              <article className="card reports-stat-card"><span className="muted small reports-stat-label">Total expenses</span><strong className="reports-stat-value">{formatMoney(filteredSummary.expensesTotal)}</strong><span className="muted small">{filteredSummary.expenseCount} entries · date spent</span></article>
              <article className="card reports-stat-card"><span className="muted small reports-stat-label">Net after expenses</span><strong className="reports-stat-value">{formatMoney(filteredSummary.netAfterExpenses)}</strong><span className="muted small">Net sales − expenses</span></article>
            </section>

            <section className="card reports-table-card">
              <h3 className="sub">Invoices in range{filteredInvoices.length !== data.invoices.length ? ` (${filteredInvoices.length} of ${data.invoices.length})` : ` (${filteredInvoices.length})`}</h3>
              {filteredInvoices.length === 0 ? <p className="muted">No invoices match the selected filters.</p> : (
                <div className="table-scroll">
                  <table className="staff-accounts-table reports-invoice-table">
                    <thead><tr><th scope="col">Business</th><th scope="col">Invoice</th><th scope="col">Issued</th><th scope="col">Order type</th><th scope="col" className="num">Total</th><th scope="col" className="num">Delivery</th><th scope="col">Status</th><th scope="col">Payment</th></tr></thead>
                    <tbody>
                      {filteredInvoices.map((inv) => {
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
              )}
            </section>

            <section className="card reports-table-card">
              <h3 className="sub">Expenses in range{filteredExpenses.length !== (data.expenses?.length ?? 0) ? ` (${filteredExpenses.length} of ${data.expenses?.length ?? 0})` : ` (${filteredExpenses.length})`}</h3>
              {filteredExpenses.length === 0 ? <p className="muted">No expenses with date spent in this period.</p> : (
                <div className="table-scroll">
                  <table className="staff-accounts-table reports-invoice-table reports-expense-table">
                    <thead><tr><th scope="col">Spent</th><th scope="col">Title</th><th scope="col">Business</th><th scope="col">Category</th><th scope="col" className="num">Amount</th><th scope="col">Note</th></tr></thead>
                    <tbody>
                      {filteredExpenses.map((ex) => (
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
          </>
        ) : null}
      </main>
    </RequireSuperAdmin>
  )
}
