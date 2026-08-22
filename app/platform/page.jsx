'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import { formatShortDateTime } from '@/utils/formatting.js'

/**
 * Every café on the platform.
 *
 * Deliberately shows activity rather than only names: with more than a handful
 * of customers the question is never "who exists" but "who has stopped taking
 * orders", and that is what a support conversation starts from.
 */
export default function PlatformPage() {
  const [tenants, setTenants] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.listTenants()
        if (!cancelled) setTenants(res.tenants)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load cafés.')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tenants ?? []
    return (tenants ?? []).filter((t) =>
      t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q))
  }, [tenants, query])

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

      <div className="card">
        <label className="field">
          <span>Search</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or URL name"
          />
        </label>

        {tenants === null ? (
          <p className="muted">Loading cafés…</p>
        ) : visible.length === 0 ? (
          <p className="muted">
            {query ? 'No café matches that search.' : 'No cafés yet. Create the first one.'}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Café</th><th>Status</th><th>Plan</th>
                  <th>Branches</th><th>Staff</th><th>Invoices</th><th>Last order</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/platform/tenants/${t.id}`}><strong>{t.name}</strong></Link>
                      <span className="muted small block">{t.slug}</span>
                    </td>
                    <td><span className={`pill pill-${t.status}`}>{t.status}</span></td>
                    <td>{t.plan}</td>
                    <td className="num">{t.locationCount}</td>
                    <td className="num">{t.userCount}</td>
                    <td className="num">{t.invoiceCount}</td>
                    <td className="muted small">
                      {t.lastOrderAt ? formatShortDateTime(t.lastOrderAt) : 'never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
