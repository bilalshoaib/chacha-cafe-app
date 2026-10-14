'use client'
import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import { useBranding, useLocale, useMoney } from '@/context/BrandingContext.jsx'
import DateRangeFilter, { useDateRange } from '@/components/DateRangeFilter.jsx'
import { SkeletonStatus } from '@/components/Skeleton.jsx'
import { tradingDay } from '@/lib/tradingDay.js'

/**
 * A partner kitchen's sales, and how they settle (lib/partners.js).
 *
 * The page both businesses look at when they settle up: what the partner
 * sold, what of that the café keeps at its discounted supply price, and what
 * the café owes the partner for the rest. Returned sales count for neither.
 */
export default function PartnerReportPage({ params }) {
  const { id } = use(params)
  const money = useMoney()
  const { formatDateTime } = useLocale()
  const branding = useBranding()
  const hours = useMemo(
    () => tradingDay({ dayStartHour: branding?.dayStartHour, dayEndHour: branding?.dayEndHour }),
    [branding?.dayStartHour, branding?.dayEndHour],
  )
  const range = useDateRange({ hours, formatDateTime, initialPreset: 'this_month' })
  const { fromIso, toIso, ready } = range
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ready || !fromIso || !toIso) return
    let cancelled = false
    setLoading(true)
    setError('')
    api.partnerReport(id, { from: fromIso, to: toIso })
      .then((r) => { if (!cancelled) setReport(r) })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, ready, fromIso, toIso])

  const s = report?.settlement
  const name = report?.partner?.name ?? 'Partner'
  const cafeName = branding?.name ?? 'the café'
  const owedByPartner = (s?.payable ?? 0) < 0

  return (
    <main className="settings-page settings-subpage partner-report">
      <div className="settings-subpage-head">
        <div>
          <h2>{name} — sales &amp; settlement</h2>
          <p className="muted small">
            {cafeName} collects every {name} sale at the till, keeps its menu price less
            {' '}{report?.partner?.supplyDiscountPct ?? 0}% for each of its items sold, and owes {name} the rest —
            {' '}including the whole of what {name}’s own items sold for.
          </p>
        </div>
        <div className="settings-subpage-actions">
          <Link href={`/partners/${id}`} className="ghost sm">← Take order</Link>
        </div>
      </div>

      <section className="card reports-filters-card">
        <DateRangeFilter range={range} />
      </section>

      {error ? <p className="banner error" role="alert">{error}</p> : null}

      {loading && !report ? <SkeletonStatus label="Loading sales…" /> : s ? (
        <>
          <section className="reports-summary-grid">
            <article className="card reports-stat-card">
              <span className="muted small reports-stat-label">{name} sales</span>
              <strong className="reports-stat-value">{money(s.sales)}</strong>
              <span className="muted small">{s.invoiceCount} invoice{s.invoiceCount === 1 ? '' : 's'} · {s.units} item{s.units === 1 ? '' : 's'}</span>
            </article>
            <article className="card reports-stat-card">
              <span className="muted small reports-stat-label">{cafeName} keeps</span>
              <strong className="reports-stat-value">{money(s.cafeShare)}</strong>
              <span className="muted small">Menu price less {report.partner.supplyDiscountPct}%</span>
            </article>
            <article className="card reports-stat-card">
              <span className="muted small reports-stat-label">
                {owedByPartner ? `${name} owes ${cafeName}` : `${cafeName} pays ${name}`}
              </span>
              <strong className="reports-stat-value">{money(Math.abs(s.payable))}</strong>
              <span className="muted small">Sales − what {cafeName} keeps</span>
            </article>
          </section>

          <section className="card">
            <h3 className="sub">By item</h3>
            {s.items.length === 0 ? <p className="muted">No {name} sales in this period.</p> : (
              <table className="partner-prices-table table-cards">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="num">Qty</th>
                    <th className="num">Sales</th>
                    <th className="num">{cafeName} keeps</th>
                    <th className="num">{name} gets</th>
                  </tr>
                </thead>
                <tbody>
                  {s.items.map((r) => (
                    <tr key={r.refId ?? r.name}>
                      <td className="cell-card-title">{r.name}</td>
                      <td data-label="Qty" className="num">{r.qty}</td>
                      <td data-label="Sales" className="num">{money(r.sales)}</td>
                      <td data-label={`${cafeName} keeps`} className="num">{money(r.cafeShare)}</td>
                      <td data-label={`${name} gets`} className={`num${r.payable < 0 ? ' partner-loss' : ''}`}>{money(r.payable)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <h3 className="sub">Invoices ({report.invoices.length})</h3>
            {report.invoices.length === 0 ? <p className="muted">None in this period.</p> : (
              <table className="partner-prices-table table-cards">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>When</th>
                    <th className="num">Total</th>
                    <th className="num">{cafeName} keeps</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.invoices.map((inv) => (
                    <tr key={inv.id} className={inv.returned ? 'is-returned' : ''}>
                      <td className="cell-card-title">{inv.id}{inv.shiftNumber != null ? ` · #${inv.shiftNumber}` : ''}</td>
                      <td data-label="When">{formatDateTime(inv.createdAt)}</td>
                      <td data-label="Total" className="num">{money(inv.total)}</td>
                      <td data-label={`${cafeName} keeps`} className="num">{inv.returned ? '—' : money(inv.cafeShare)}</td>
                      <td data-label="Status">{inv.returned ? 'Returned' : inv.paid ? 'Paid' : 'Unpaid'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
    </main>
  )
}
