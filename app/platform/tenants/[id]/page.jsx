'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/api.js'
import { formatShortDateTime } from '@/utils/formatting.js'

/**
 * One café: what it is, how much it is being used, and the two levers the
 * platform holds over it — its plan and whether it is suspended.
 *
 * Nothing here edits the café's own configuration. Its name, colours, logo,
 * branches, categories and staff belong to its owner, on their settings pages;
 * a console that sets those for each customer is a console that has to be used
 * for every customer.
 */
export default function TenantDetailPage() {
  const { id } = useParams()
  const [tenant, setTenant] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const t = await api.getTenant(id)
        if (!cancelled) setTenant(t)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load this café.')
      }
    })()
    return () => { cancelled = true }
  }, [id])

  async function patch(fields, note) {
    setError(''); setMessage(''); setSaving(true)
    try {
      setTenant(await api.updateTenant(id, fields))
      setMessage(note)
    } catch (e) {
      setError(e.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  if (error && !tenant) return <main className="platform-page"><p className="banner error">{error}</p></main>
  if (!tenant) return <main className="platform-page"><p className="muted">Loading…</p></main>

  const suspended = tenant.status === 'suspended'

  return (
    <main className="platform-page">
      <div className="page-hero">
        <div className="page-hero-body">
          <div className="page-hero-icon">🏢</div>
          <div>
            <h1>{tenant.name}</h1>
            <p className="muted small">
              {tenant.slug} · created {formatShortDateTime(tenant.createdAt)}
            </p>
          </div>
        </div>
        <Link href="/platform" className="ghost btn-link">All cafés</Link>
      </div>

      {error ? <p className="banner error" role="alert">{error}</p> : null}
      {message ? <p className="banner success" role="status">{message}</p> : null}

      <section className="reports-summary-grid">
        {[
          { label: 'Branches', value: tenant.locationCount },
          { label: 'Counters', value: tenant.brandCount },
          { label: 'Staff accounts', value: tenant.userCount },
          { label: 'Invoices', value: tenant.invoiceCount },
        ].map((s) => (
          <article key={s.label} className="card reports-stat-card">
            <span className="muted small reports-stat-label">{s.label}</span>
            <strong className="reports-stat-value">{s.value}</strong>
          </article>
        ))}
        <article className="card reports-stat-card">
          <span className="muted small reports-stat-label">Last order</span>
          <strong className="reports-stat-value">
            {tenant.lastOrderAt ? formatShortDateTime(tenant.lastOrderAt) : 'never'}
          </strong>
        </article>
      </section>

      <div className="card">
        <h2>Plan</h2>
        <div className="row gap">
          {['trial', 'standard', 'multi-branch'].map((p) => (
            <button
              key={p}
              type="button"
              className={p === tenant.plan ? 'primary' : 'ghost'}
              disabled={saving || p === tenant.plan}
              onClick={() => patch({ plan: p }, `Plan changed to ${p}.`)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>{suspended ? 'Suspended' : 'Active'}</h2>
        <p className="muted small">
          {suspended
            ? 'Nobody at this café can sign in. Their data is untouched and comes back exactly as it was.'
            : 'Suspending blocks sign-in for everyone here. Nothing is deleted, and it can be undone at any time.'}
        </p>
        <button
          type="button"
          className={suspended ? 'primary' : 'ghost danger'}
          disabled={saving}
          onClick={() => patch(
            { status: suspended ? 'active' : 'suspended' },
            suspended ? 'Café reactivated.' : 'Café suspended.',
          )}
        >
          {suspended ? 'Reactivate café' : 'Suspend café'}
        </button>
      </div>
    </main>
  )
}
