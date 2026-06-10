'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/api.js'
import RequireSuperAdmin from '@/components/RequireSuperAdmin.jsx'

export default function TeamUserAddPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('staff')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      const user = await api.createUser({ email, password, role, displayName: displayName.trim() || undefined })
      router.replace(`/settings/team/${user.id}`)
    } catch (err) { setError(err.message || 'Could not create account') }
    finally { setSaving(false) }
  }

  return (
    <RequireSuperAdmin>
      <main className="team-page team-form-page">
        <div className="team-page-head">
          <div>
            <p className="muted small team-detail-kicker">Add account</p>
            <h2>New staff or admin</h2>
            <p className="muted small">Password must be at least 8 characters.</p>
          </div>
          <Link href="/settings/team" className="ghost sm">Cancel</Link>
        </div>
        <section className="card team-form-card">
          <form onSubmit={(e) => void handleSubmit(e)} className="settings-form team-user-form">
            <label className="field">
              <span>Display name</span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} disabled={saving} placeholder="Optional" />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={saving} autoComplete="off" />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} disabled={saving} autoComplete="new-password" />
            </label>
            <label className="field">
              <span>Role</span>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value)} disabled={saving}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            {error ? <p className="banner error" role="alert">{error}</p> : null}
            <div className="team-form-actions">
              <button type="submit" className="primary" disabled={saving}>{saving ? 'Creating…' : 'Create account'}</button>
            </div>
          </form>
        </section>
      </main>
    </RequireSuperAdmin>
  )
}
