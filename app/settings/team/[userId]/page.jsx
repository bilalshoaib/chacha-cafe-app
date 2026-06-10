'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { api } from '@/api.js'
import RoleBadge from '@/components/RoleBadge.jsx'
import RequireSuperAdmin from '@/components/RequireSuperAdmin.jsx'
import { formatShortDateTime } from '@/utils/formatting.js'

export default function TeamUserDetailPage() {
  const { userId } = useParams()
  const [u, setU] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setError(''); setLoading(true)
      try {
        const row = await api.getUser(userId)
        if (!cancelled) setU(row)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load user')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [userId])

  return (
    <RequireSuperAdmin>
      <main className="team-page team-detail-page">
        <div className="team-page-head">
          <div>
            <p className="muted small team-detail-kicker">Team member</p>
            <h2>{u?.email ?? 'Account'}</h2>
          </div>
          <div className="team-page-actions">
            <Link href="/settings/team" className="ghost sm">← All team</Link>
            {u ? <Link href={`/settings/team/${u.id}/edit`} className="primary sm">Edit</Link> : null}
          </div>
        </div>

        {error ? (
          <section className="card">
            <p className="banner error" role="alert">{error}</p>
            <p className="muted small"><Link href="/settings/team" className="inline-link">Back to list</Link></p>
          </section>
        ) : null}

        {loading ? <p className="muted">Loading…</p> : u ? (
          <article className="card team-detail-card">
            <dl className="team-detail-dl">
              <div><dt>Email</dt><dd>{u.email}</dd></div>
              <div><dt>Display name</dt><dd>{u.displayName || '—'}</dd></div>
              <div><dt>Role</dt><dd><RoleBadge role={u.role} /></dd></div>
              <div><dt>Created</dt><dd>{u.createdAt ? formatShortDateTime(u.createdAt) : '—'}</dd></div>
            </dl>
          </article>
        ) : null}
      </main>
    </RequireSuperAdmin>
  )
}
