'use client'
import { useEffect, useMemo, useState } from 'react'
import { PendingLink } from '@/components/NavPending.jsx'
import { SkeletonTable } from '@/components/Skeleton.jsx'
import { api } from '@/api.js'
import { formatMoney, formatShortDateTime } from '@/utils/formatting.js'

/**
 * Every café on the platform, and how much each one is being used.
 *
 * Ordered by most recent order rather than by name. Past a handful of
 * customers the question is never who exists but who has stopped, and the café
 * that has gone quiet is invisible in an alphabetical list.
 */
const WINDOWS = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: '365d', label: 'Year' },
]

function daysSince(iso) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function Stat({ label, value, note, warn = false }) {
  return (
    <article className={`platform-stat${warn ? ' platform-stat-warn' : ''}`}>
      <span className="platform-stat-label">{label}</span>
      {Array.isArray(value)
        ? value.map((v) => <strong key={v} className="platform-stat-value stacked">{v}</strong>)
        : <strong className="platform-stat-value">{value}</strong>}
      {note ? <span className="platform-stat-note">{note}</span> : null}
    </article>
  )
}

export default function PlatformPage() {
  const [data, setData] = useState(null)
  const [windowId, setWindowId] = useState('30d')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setData(null)
    ;(async () => {
      try {
        const res = await api.platformActivity(windowId)
        if (!cancelled) { setData(res); setError('') }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load cafés.')
      }
    })()
    return () => { cancelled = true }
  }, [windowId])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = data?.cafes ?? []
    if (!q) return list
    return list.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q))
  }, [data, query])

  const totals = data?.totals
  const takings = totals ? Object.entries(totals.revenueByCurrency) : []

  return (
    <main className="platform-page">
      <div className="platform-head">
        <div>
          <h1>Cafés</h1>
          <p className="muted small">
            Every business on the platform. Creating one sets up its branch, its menu and its owner’s account.
          </p>
        </div>
        <PendingLink href="/platform/tenants/new" className="primary btn-link">New café</PendingLink>
      </div>

      {error ? <p className="banner error" role="alert">{error}</p> : null}

      <div className="platform-toolbar">
        <div className="window-picker" role="group" aria-label="Reporting period">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              type="button"
              aria-pressed={w.id === windowId}
              onClick={() => setWindowId(w.id)}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div className="platform-search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name"
            aria-label="Search cafés"
          />
        </div>
      </div>

      {totals ? (
        <section className="platform-stats">
          <Stat
            label="Cafés"
            value={totals.cafeCount}
            note={`${totals.activeCount} active · ${totals.trialCount} trial · ${totals.suspendedCount} suspended`}
          />
          <Stat
            label="Orders taken"
            value={totals.periodInvoices.toLocaleString()}
            note="Across all cafés"
          />
          {/* Grouped by currency rather than summed. Adding rupees to pounds
              gives a figure that looks authoritative and means nothing. */}
          <Stat
            label="Their takings"
            value={takings.length === 0
              ? '—'
              : takings.map(([currency, amount]) => formatMoney(amount, { currency }))}
            note="Excluding returns"
          />
          <Stat
            label="Gone quiet"
            value={totals.quietCount}
            note="No orders in this period"
            warn={totals.quietCount > 0}
          />
        </section>
      ) : null}

      <div className="platform-table-wrap">
        {data === null ? (
          // The real headers, so the columns are already where the cafés will
          // land and the page does not shift when they do.
          <SkeletonTable
            label="Loading cafés…"
            rows={4}
            columns={[
              { key: 'cafe', label: 'Café' },
              { key: 'status', label: 'Status' },
              { key: 'orders', label: 'Orders', num: true },
              { key: 'takings', label: 'Takings', num: true },
              { key: 'branches', label: 'Branches', num: true },
              { key: 'staff', label: 'Staff', num: true },
              { key: 'last', label: 'Last order' },
            ]}
          />
        ) : visible.length === 0 ? (
          <div className="platform-empty">
            {query ? (
              <>
                <strong>Nothing matches “{query}”</strong>
                Try part of the name or the URL name.
              </>
            ) : (
              <>
                <strong>No cafés yet</strong>
                Create the first one and it will appear here.
              </>
            )}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th scope="col">Café</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Orders</th>
                  <th scope="col" className="num">Takings</th>
                  <th scope="col" className="num">Branches</th>
                  <th scope="col" className="num">Staff</th>
                  <th scope="col">Last order</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const quiet = c.status !== 'suspended' && c.periodInvoices === 0
                  const idle = daysSince(c.lastOrderAt)
                  return (
                    <tr key={c.id} className={quiet ? 'row-quiet' : undefined}>
                      <td className="cell-card-title">
                        <PendingLink href={`/platform/tenants/${c.id}`} className="cafe-name">{c.name}</PendingLink>
                        <span className="cafe-slug block">{c.slug}</span>
                      </td>
                      <td data-label="Status"><span className={`pill pill-${c.status}`}>{c.status}</span></td>
                      <td className="num" data-label="Orders">{c.periodInvoices.toLocaleString()}</td>
                      <td className="num" data-label="Takings">{formatMoney(c.periodRevenue, { currency: c.currency })}</td>
                      <td className="num" data-label="Branches">{c.locationCount}</td>
                      <td className="num" data-label="Staff">{c.userCount}</td>
                      <td data-label="Last order">
                        {c.lastOrderAt ? (
                          <>
                            <span className="cafe-slug block">{formatShortDateTime(c.lastOrderAt)}</span>
                            {idle > 2 ? <span className="cell-idle block">{idle} days ago</span> : null}
                          </>
                        ) : (
                          <span className="cell-idle">never</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
