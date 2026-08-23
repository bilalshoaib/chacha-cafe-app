'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/api.js'
import { formatShortDateTime } from '@/utils/formatting.js'

/**
 * One café: what it is, how much it is being used, and the levers the platform
 * holds over it — support access, plan, and suspension.
 *
 * Nothing here edits the café's own configuration. Its name, colours, logo,
 * branches, categories and staff belong to its owner on their settings pages.
 * What can be done sits on the left and what has been done on the right, since
 * the trail is reference rather than action.
 */
export default function TenantDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [tenant, setTenant] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  // Held in state rather than refetched: it is returned once and never stored
  // in a readable form, so leaving the page is what loses it.
  const [issued, setIssued] = useState(null)

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
      const updated = await api.updateTenant(id, fields)
      setTenant((prev) => ({ ...prev, ...updated }))
      setMessage(note)
    } catch (e) {
      setError(e.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function resetPassword() {
    setError(''); setMessage(''); setSaving(true)
    try {
      const res = await api.resetOwnerPassword(id)
      setIssued(res.owner)
      // Refresh so the reset appears in the trail beside it.
      setTenant(await api.getTenant(id))
    } catch (e) {
      setError(e.message || 'Could not issue a password.')
    } finally {
      setSaving(false)
    }
  }

  async function openAs(control) {
    setError('')
    try {
      await api.impersonate(id, control)
      router.push('/')
      router.refresh()
    } catch (e) {
      setError(e.message || 'Could not open this café.')
    }
  }

  if (error && !tenant) {
    return <main className="platform-page"><p className="banner error">{error}</p></main>
  }
  if (!tenant) {
    return <main className="platform-page"><p className="platform-empty">Loading…</p></main>
  }

  const suspended = tenant.status === 'suspended'
  const stats = [
    { label: 'Branches', value: tenant.locationCount },
    { label: 'Counters', value: tenant.brandCount },
    { label: 'Staff', value: tenant.userCount },
    { label: 'Invoices', value: (tenant.invoiceCount ?? 0).toLocaleString() },
    { label: 'Last order', value: tenant.lastOrderAt ? formatShortDateTime(tenant.lastOrderAt) : 'never' },
  ]

  return (
    <main className="platform-page">
      <div className="platform-head">
        <div>
          <Link href="/platform" className="platform-back">← All cafés</Link>
          <h1>{tenant.name}</h1>
          <p className="muted small">
            {tenant.slug} · {tenant.plan} · created {formatShortDateTime(tenant.createdAt)}
          </p>
        </div>
        <span className={`pill pill-${tenant.status}`}>{tenant.status}</span>
      </div>

      {error ? <p className="banner error" role="alert">{error}</p> : null}
      {message ? <p className="banner success" role="status">{message}</p> : null}

      <section className="platform-stats">
        {stats.map((s) => (
          <article key={s.label} className="platform-stat">
            <span className="platform-stat-label">{s.label}</span>
            <strong className="platform-stat-value">{s.value}</strong>
          </article>
        ))}
      </section>

      <div className="platform-columns">
        <div className="platform-columns-left">
          <div className="pf-card">
            <h2>Support access</h2>
            <p>
              Opens the app as this café so you can see what they see. Read-only unless you
              deliberately take control, limited to 30 minutes, and written to the trail
              where the owner can see it.
            </p>
            <div className="pf-actions">
              <button type="button" className="primary" disabled={saving} onClick={() => void openAs(false)}>
                Open read-only
              </button>
              <button type="button" className="ghost danger" disabled={saving} onClick={() => void openAs(true)}>
                Open and take control
              </button>
            </div>
          </div>

          <div className="pf-card">
            <h2>Owner sign-in</h2>
            <p>
              {tenant.ownerEmail
                ? <>Their account is <code>{tenant.ownerEmail}</code>. The stored password is a hash and cannot be read back, so the way to get one is to issue a new one — the same thing that happens when a customer forgets theirs. It appears here once and is written to the trail.</>
                : 'This café has no owner account.'}
            </p>
            {issued ? (
              <dl className="handover">
                <dt>Sign in with</dt>
                <dd><code>{issued.email}</code></dd>
                <dt>New password</dt>
                <dd><code className="handover-password">{issued.temporaryPassword}</code></dd>
              </dl>
            ) : null}
            {tenant.ownerEmail ? (
              <div className="pf-actions">
                <button type="button" className="ghost" disabled={saving} onClick={() => void resetPassword()}>
                  {issued ? 'Issue another' : 'Issue a new password'}
                </button>
              </div>
            ) : null}
          </div>

          <div className="pf-card">
            <h2>Plan</h2>
            <p>What they are billed on. Changing it takes effect immediately.</p>
            <div className="plan-picker" role="group" aria-label="Plan">
              {['trial', 'standard', 'multi-branch'].map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={p === tenant.plan}
                  disabled={saving || p === tenant.plan}
                  onClick={() => patch({ plan: p }, `Plan changed to ${p}.`)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className={`pf-card ${suspended ? 'pf-card-suspended' : 'pf-card-danger'}`}>
            <h2>{suspended ? 'Suspended' : 'Access'}</h2>
            <p>
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
        </div>

        <div className="pf-card">
          <h2>Trail</h2>
          <p>Every time somebody from the platform opened this café.</p>
          {(tenant.audit ?? []).length === 0 ? (
            <p className="pf-hint">Nobody has opened it yet.</p>
          ) : (
            <ul className="audit-list">
              {tenant.audit.map((entry) => (
                <li key={entry.id}>
                  <span className="audit-what">{entry.detail || entry.action}</span>
                  <span className="audit-when">{formatShortDateTime(entry.createdAt)}</span>
                  <span className="audit-who">{entry.actorEmail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}
