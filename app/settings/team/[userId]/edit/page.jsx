'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/api.js'
import RequireSuperAdmin from '@/components/RequireSuperAdmin.jsx'
import { useAuth } from '@/context/AuthContext.jsx'

export default function TeamUserEditPage() {
  const { userId } = useParams()
  const router = useRouter()
  const { user: sessionUser, refreshAuth } = useAuth()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('staff')
  const [newPassword, setNewPassword] = useState('')
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoadError(''); setLoading(true)
      try {
        const u = await api.getUser(userId)
        if (cancelled) return
        setEmail(u.email ?? ''); setDisplayName(u.displayName ?? '')
        setRole(['admin', 'staff', 'counter_cashier'].includes(u.role) ? u.role : 'staff')
        setIsSuperAdmin(u.role === 'super_admin')
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'Could not load user')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [userId])

  async function handleSubmit(e) {
    e.preventDefault(); setSaveError('')
    const np = newPassword.trim()
    if (np && np.length < 8) { setSaveError('New password must be at least 8 characters.'); return }
    setSaving(true)
    try {
      const body = { email, displayName, ...(np ? { newPassword: np } : {}) }
      if (!isSuperAdmin) body.role = role
      await api.updateUser(userId, body)
      if (sessionUser?.id === userId) await refreshAuth()
      router.replace(`/settings/team/${userId}`)
    } catch (err) { setSaveError(err.message || 'Could not save') }
    finally { setSaving(false) }
  }

  return (
    <RequireSuperAdmin>
      <main className="team-page team-form-page">
        <div className="team-page-head">
          <div>
            <p className="muted small team-detail-kicker">Edit account</p>
            <h2>{loading ? '…' : email}</h2>
            {isSuperAdmin ? (
              <p className="muted small">Super admin: you can update email, name, and set a new password. Role stays super admin.</p>
            ) : (
              <p className="muted small">Leave new password blank to keep the current one.</p>
            )}
          </div>
          <Link href={loadError ? '/settings/team' : `/settings/team/${userId}`} className="ghost sm">Cancel</Link>
        </div>

        {loadError ? <section className="card"><p className="banner error" role="alert">{loadError}</p></section> : null}

        {!loadError && !loading ? (
          <section className="card team-form-card">
            <form onSubmit={(e) => void handleSubmit(e)} className="settings-form team-user-form">
              <label className="field">
                <span>Display name</span>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} disabled={saving} />
              </label>
              <label className="field">
                <span>Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={saving} />
              </label>
              {!isSuperAdmin ? (
                <label className="field">
                  <span>Role</span>
                  <select className="select" value={role} onChange={(e) => setRole(e.target.value)} disabled={saving}>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                    <option value="counter_cashier">Counter cashier</option>
                  </select>
                </label>
              ) : <p className="muted small field-hint">Role: super admin (fixed)</p>}
              <label className="field">
                <span>New password</span>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={saving} placeholder="Leave blank to keep current" autoComplete="new-password" />
              </label>
              {saveError ? <p className="banner error" role="alert">{saveError}</p> : null}
              <div className="team-form-actions">
                <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
              </div>
            </form>
          </section>
        ) : null}

        {loading ? <p className="muted">Loading…</p> : null}
      </main>
    </RequireSuperAdmin>
  )
}
