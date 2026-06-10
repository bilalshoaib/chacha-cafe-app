'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import RoleBadge from '@/components/RoleBadge.jsx'
import RequireSuperAdmin from '@/components/RequireSuperAdmin.jsx'
import { formatShortDateTime } from '@/utils/formatting.js'

export default function TeamListPage() {
  const [list, setList] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setError('')
    try {
      const rows = await api.listUsers()
      const sorted = [...(Array.isArray(rows) ? rows : [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      setList(sorted)
    } catch (e) { setError(e.message || 'Could not load team') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <RequireSuperAdmin>
      <main className="team-page">
        <div className="team-page-head">
          <div>
            <h2>Team &amp; admins</h2>
            <p className="muted small">All accounts. Open a row for details, or add staff and admin logins (full app access except this management area).</p>
          </div>
          <div className="team-page-actions">
            <Link href="/settings" className="ghost sm">← Settings</Link>
            <Link href="/settings/team/new" className="primary sm">Add account</Link>
          </div>
        </div>

        {error ? (
          <p className="banner error" role="alert">
            {error}{' '}
            <button type="button" className="inline-link-button" onClick={() => void load()}>Retry</button>
          </p>
        ) : null}

        <section className="card team-list-card">
          {loading ? <p className="muted">Loading…</p> : (
            <div className="table-scroll">
              <table className="staff-accounts-table team-list-table">
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">Name</th>
                    <th scope="col">Role</th>
                    <th scope="col">Created</th>
                    <th scope="col" className="team-col-action"> </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((u) => (
                    <tr key={u.id} className="team-list-row">
                      <td><Link href={`/settings/team/${u.id}`} className="team-row-link">{u.email}</Link></td>
                      <td className="muted">{u.displayName || '—'}</td>
                      <td><RoleBadge role={u.role} /></td>
                      <td className="muted">{u.createdAt ? formatShortDateTime(u.createdAt) : '—'}</td>
                      <td className="team-col-action"><Link href={`/settings/team/${u.id}`} className="inline-link">View</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && list.length === 0 && !error ? <p className="muted">No accounts yet.</p> : null}
        </section>
      </main>
    </RequireSuperAdmin>
  )
}
