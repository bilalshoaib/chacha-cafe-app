'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import RoleBadge from '@/components/RoleBadge.jsx'
import RequireSuperAdmin from '@/components/RequireSuperAdmin.jsx'
import { useLocale } from '@/context/BrandingContext.jsx'
import { SkeletonTable } from '@/components/Skeleton.jsx'

export default function TeamListPage() {
  const { formatDateTime } = useLocale()
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
          {loading ? (
            <SkeletonTable
              label="Loading team…"
              rows={4}
              tableClassName="staff-accounts-table team-list-table"
              columns={[
                { key: 'email', label: 'Email' },
                { key: 'name', label: 'Name' },
                { key: 'role', label: 'Role' },
                { key: 'created', label: 'Created' },
                { key: 'action', label: ' ' },
              ]}
            />
          ) : (
            <div className="table-scroll">
              <table className="staff-accounts-table team-list-table table-cards">
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
                      <td className="cell-card-title"><Link href={`/settings/team/${u.id}`} className="team-row-link">{u.email}</Link></td>
                      <td className="muted" data-label="Name">{u.displayName || '—'}</td>
                      <td data-label="Role"><RoleBadge role={u.role} /></td>
                      <td className="muted" data-label="Created">{u.createdAt ? formatDateTime(u.createdAt) : '—'}</td>
                      <td className="team-col-action cell-card-action"><Link href={`/settings/team/${u.id}`} className="inline-link">View</Link></td>
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
