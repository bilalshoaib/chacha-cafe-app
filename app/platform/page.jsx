'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import { formatMoney, formatShortDateTime } from '@/utils/formatting.js'

/**
 * Every café on the platform, and how much each is being used.
 *
 * Sorted by most recent order rather than by name, because with more than a
 * handful of customers the question is never who exists but who has stopped —
 * and a café that has gone quiet is invisible in an alphabetical list.
 */
const WINDOWS = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: '365d', label: 'A year' },
]

function daysSince(iso) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
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

  return (
    <main className="platform-page">
      <div className="platform-head">
        <div>
          <h1>Cafés</h1>
          <p className="muted small">
            Every business on the platform. Creating one sets up its branch, menu and owner account.
          </p>
        </div>
        <Link href="/platform/tenants/new" className="primary btn-link">New café</Link>
      </div>

      {error ? <p className="banner error" role="alert">{error}</p> : null}

      <div className="window-picker" role="group" aria-label="Reporting period">
        {WINDOWS.map((w) => (
          <button
            key={w.id}
            type="button"
            className={w.id === windowId ? 'primary sm' : 'ghost sm'}
            onClick={() => setWindowId(w.id)}
          >
            {w.label}
          </button>
        ))}
      </div>

      {totals ? (
        <section className="platform-stats">
          <article className="card platform-stat">
            <span className="muted small">Cafés</span>
            <strong>{totals.cafeCount}</strong>
            <span className="muted small">
              {totals.activeCount} active · {totals.trialCount} trial · {totals.suspendedCount} suspended
            </span>
          </article>
          <article className="card platform-stat">
            <span className="muted small">Orders taken</span>
            <strong>{totals.periodInvoices.toLocaleString()}</strong>
            <span className="muted small">Across all cafés</span>
          </article>
          {/* Grouped by currency rather than summed. Adding rupees to pounds
              gives a number that looks authoritative and means nothing. */}
          <article className="card platform-stat">
            <span className="muted small">Their takings</span>
            {Object.keys(totals.revenueByCurrency).length === 0 ? (
              <strong>—</strong>
            ) : (
              Object.entries(totals.revenueByCurrency).map(([currency, amount]) => (
                <strong key={currency} className="stacked">
                  {formatMoney(amount, { currency })}
                </strong>
              ))
            )}
            <span className="muted small">Excluding returns</span>
          </article>
          <article className={`card platform-stat${totals.quietCount > 0 ? ' platform-stat-warn' : ''}`}>
            <span className="muted small">Gone quiet</span>
            <strong>{totals.quietCount}</strong>
            <span className="muted small">No orders in this period</span>
          </article>
        </section>
      ) : null}

      <div className="card">
        <label className="field">
          <span>Search</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or URL name" />
        </label>

        {data === null ? (
          <p className="muted">Loading cafés…</p>
        ) : visible.length === 0 ? (
          <p className="muted">{query ? 'No café matches that search.' : 'No cafés yet. Create the first one.'}</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Café</th>
                  <th>Status</th>
                  <th className="num">Orders</th>
                  <th className="num">Takings</th>
                  <th className="num">Branches</th>
                  <th className="num">Staff</th>
                  <th>Last order</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const quiet = c.status !== 'suspended' && c.periodInvoices === 0
                  const idle = daysSince(c.lastOrderAt)
                  return (
                    <tr key={c.id} className={quiet ? 'row-quiet' : undefined}>
                      <td>
                        <Link href={`/platform/tenants/${c.id}`}><strong>{c.name}</strong></Link>
                        <span className="muted small block">{c.slug}</span>
                      </td>
                      <td><span className={`pill pill-${c.status}`}>{c.status}</span></td>
                      <td className="num">{c.periodInvoices.toLocaleString()}</td>
                      <td className="num">{formatMoney(c.periodRevenue, { currency: c.currency })}</td>
                      <td className="num">{c.locationCount}</td>
                      <td className="num">{c.userCount}</td>
                      <td className="muted small">
                        {c.lastOrderAt
                          ? <>{formatShortDateTime(c.lastOrderAt)}{idle > 2 ? <span className="block">{idle} days ago</span> : null}</>
                          : 'never'}
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
