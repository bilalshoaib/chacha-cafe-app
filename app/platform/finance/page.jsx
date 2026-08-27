'use client'
import Link from 'next/link'
import { usePlatformBooks } from '@/context/PlatformBooksContext.jsx'
import { formatMoney, formatShortDateTime } from '@/utils/formatting.js'
import Skeleton, { SkeletonStatus } from '@/components/Skeleton.jsx'

/** A bar whose length is a share of the largest figure beside it. */
function Bar({ value, max, tone = 'good' }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return <span className={`books-bar books-bar-${tone}`}><span style={{ width: `${pct}%` }} /></span>
}

export default function PlatformBooksReportPage() {
  const { report, loading } = usePlatformBooks()

  if (loading && !report) {
    return (
      <div className="tenant-overview">
        <SkeletonStatus label="Working out the books…" />
        <section className="platform-stats">
          {[0, 1, 2, 3].map((i) => (
            <article key={i} className="platform-stat">
              <Skeleton width="5rem" height="0.7rem" />
              <Skeleton width="7rem" height="1.6rem" style={{ marginTop: '0.35rem' }} />
            </article>
          ))}
        </section>
      </div>
    )
  }
  if (!report) return null

  const { earned, spent, profit, runRate, perCafe, byCategory, paymentCount, expenseCount, recurringSpend } = report
  const paying = perCafe.filter((c) => c.paid > 0)
  const owing = perCafe.filter((c) => c.paid === 0 && c.monthlyPrice > 0 && (c.status === 'active' || c.status === 'restricted'))
  const maxPaid = Math.max(0, ...perCafe.map((c) => c.paid))
  const maxCat = Math.max(0, ...byCategory.map((c) => c.total))

  return (
    <div className="tenant-overview">
      <section className="platform-stats">
        <article className="platform-stat books-stat-in">
          <span className="platform-stat-label">Earned</span>
          <strong className="platform-stat-value">{formatMoney(earned)}</strong>
          <span className="platform-stat-note">{paymentCount} payment{paymentCount === 1 ? '' : 's'} from {paying.length} café{paying.length === 1 ? '' : 's'}</span>
        </article>
        <article className="platform-stat books-stat-out">
          <span className="platform-stat-label">Spent</span>
          <strong className="platform-stat-value">{formatMoney(spent)}</strong>
          <span className="platform-stat-note">
            {expenseCount} item{expenseCount === 1 ? '' : 's'}
            {recurringSpend > 0 ? ` · ${formatMoney(recurringSpend)} recurring` : ''}
          </span>
        </article>
        <article className={`platform-stat ${profit < 0 ? 'platform-stat-warn' : 'books-stat-in'}`}>
          <span className="platform-stat-label">{profit < 0 ? 'Shortfall' : 'Kept'}</span>
          <strong className="platform-stat-value">{formatMoney(profit)}</strong>
          <span className="platform-stat-note">
            {earned > 0 ? `${Math.round((profit / earned) * 100)}% of what came in` : 'nothing in yet'}
          </span>
        </article>
        <article className="platform-stat">
          <span className="platform-stat-label">Billing a month</span>
          <strong className="platform-stat-value">{formatMoney(runRate)}</strong>
          {/* Deliberately not called revenue. It is what the price list says
              they owe, which is a different number from what has arrived. */}
          <span className="platform-stat-note">if every paying café pays</span>
        </article>
      </section>

      {owing.length > 0 ? (
        <p className="tenant-blocked-strip" role="status">
          <strong>{owing.length} café{owing.length === 1 ? ' has' : 's have'} paid nothing in this period.</strong>{' '}
          {owing.map((c) => c.name).join(', ')}.{' '}
          <Link href="/platform/finance/payments">Record a payment →</Link>
        </p>
      ) : null}

      <div className="platform-columns">
        <div className="pf-card">
          <h2>By café</h2>
          <p>What each one paid in this period, against what they are priced at.</p>
          {perCafe.length === 0 ? <p className="pf-hint">No cafés yet.</p> : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Café</th>
                    <th className="num">Priced at</th>
                    <th className="num">Paid</th>
                    <th>Last paid</th>
                  </tr>
                </thead>
                <tbody>
                  {perCafe.map((c) => (
                    <tr key={c.tenantId} className={c.paid === 0 && c.monthlyPrice > 0 && c.status !== 'trial' ? 'row-quiet' : undefined}>
                      <td>
                        <Link href={`/platform/tenants/${c.tenantId}/billing`} className="cafe-name block">{c.name}</Link>
                        <span className="cafe-slug">{c.plan}{c.status !== 'active' ? ` · ${c.status}` : ''}</span>
                      </td>
                      <td className="num">{c.monthlyPrice > 0 ? `${formatMoney(c.monthlyPrice)}/mo` : '—'}</td>
                      <td className="num">
                        {formatMoney(c.paid)}
                        <Bar value={c.paid} max={maxPaid} />
                      </td>
                      <td>{c.lastPaidAt ? formatShortDateTime(c.lastPaidAt) : <span className="cell-idle">never</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="pf-card">
          <h2>Where it went</h2>
          <p>The platform’s own costs in this period, by category.</p>
          {byCategory.length === 0 ? (
            <p className="pf-hint">
              Nothing recorded. <Link href="/platform/finance/expenses" className="inline-link">Add an expense →</Link>
            </p>
          ) : (
            <ul className="books-cat-list">
              {byCategory.map((c) => (
                <li key={c.category}>
                  <span className="books-cat-name">{c.category}</span>
                  <span className="books-cat-amount">{formatMoney(c.total)}</span>
                  <Bar value={c.total} max={maxCat} tone="out" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
