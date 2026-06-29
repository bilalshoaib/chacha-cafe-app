'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import { useAuth } from '@/context/AuthContext.jsx'

export default function SettingsPage() {
  const { user, refreshAuth } = useAuth()

  const [profileEmail, setProfileEmail] = useState('')
  const [profileName, setProfileName] = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [profileErr, setProfileErr] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  const [curPass, setCurPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [newPass2, setNewPass2] = useState('')
  const [passMsg, setPassMsg] = useState('')
  const [passErr, setPassErr] = useState('')
  const [passSaving, setPassSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    setProfileEmail(user.email ?? '')
    setProfileName(user.displayName ?? '')
  }, [user])

  if (!user) return null

  async function saveProfile(e) {
    e.preventDefault(); setProfileErr(''); setProfileMsg(''); setProfileSaving(true)
    try {
      const { user: u } = await api.updateProfile({ email: profileEmail, displayName: profileName })
      setProfileMsg('Profile saved.')
      await refreshAuth()
      if (u?.email) setProfileEmail(u.email)
      if (u?.displayName != null) setProfileName(u.displayName ?? '')
    } catch (err) { setProfileErr(err.message || 'Could not save profile') }
    finally { setProfileSaving(false) }
  }

  async function savePassword(e) {
    e.preventDefault(); setPassErr(''); setPassMsg('')
    if (newPass !== newPass2) { setPassErr('New passwords do not match.'); return }
    setPassSaving(true)
    try {
      await api.changeMyPassword(curPass, newPass)
      setPassMsg('Password updated.')
      setCurPass(''); setNewPass(''); setNewPass2('')
    } catch (err) { setPassErr(err.message || 'Could not update password') }
    finally { setPassSaving(false) }
  }

  return (
    <main className="settings-page">
      <div className="page-hero">
        <div className="page-hero-deco" aria-hidden="true">🔒 👤 ⚙️</div>
        <div className="page-hero-body">
          <div className="page-hero-icon">⚙️</div>
          <div style={{ flex: 1 }}>
            <h1 className="page-hero-title">Settings</h1>
            <p className="page-hero-sub">Manage your profile, password, and team accounts.</p>
          </div>
          <Link href="/orders" className="ghost sm" style={{ flexShrink: 0, alignSelf: 'flex-start' }}>← Back</Link>
        </div>
      </div>

      {user.role === 'super_admin' ? (
        <>
          <section className="card settings-card settings-team-link-card">
            <h3 className="sub">Team &amp; admins</h3>
            <p className="muted small">List accounts, open details, and add or edit staff and admin logins (with display name, email, role, and password).</p>
            <Link href="/settings/team" className="primary sm settings-team-link">Open team management</Link>
          </section>
          <section className="card settings-card settings-team-link-card">
            <h3 className="sub">Sales &amp; expense reports</h3>
            <p className="muted small">Invoices and expenses by date range: net sales, returns, expense totals, net after expenses, and line-by-line lists.</p>
            <Link href="/settings/reports" className="primary sm settings-team-link">Open reports</Link>
          </section>
        </>
      ) : null}

      <section className="card settings-card">
        <h3 className="sub">Profile</h3>
        <form onSubmit={(e) => void saveProfile(e)} className="settings-form">
          <label className="field">
            <span>Display name</span>
            <input value={profileName} onChange={(e) => setProfileName(e.target.value)} maxLength={80} disabled={profileSaving} placeholder="Shown on receipts or reports later" />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} required disabled={profileSaving} autoComplete="email" />
          </label>
          {profileErr ? <p className="banner error" role="alert">{profileErr}</p> : null}
          {profileMsg ? <p className="banner success settings-banner-quiet" role="status">{profileMsg}</p> : null}
          <button type="submit" className="primary" disabled={profileSaving}>{profileSaving ? 'Saving…' : 'Save profile'}</button>
        </form>
      </section>

      <section className="card settings-card">
        <h3 className="sub">Change password</h3>
        <form onSubmit={(e) => void savePassword(e)} className="settings-form">
          <label className="field">
            <span>Current password</span>
            <input type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} required disabled={passSaving} autoComplete="current-password" />
          </label>
          <label className="field">
            <span>New password</span>
            <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={8} disabled={passSaving} autoComplete="new-password" />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input type="password" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} required minLength={8} disabled={passSaving} autoComplete="new-password" />
          </label>
          {passErr ? <p className="banner error" role="alert">{passErr}</p> : null}
          {passMsg ? <p className="banner success settings-banner-quiet" role="status">{passMsg}</p> : null}
          <button type="submit" className="primary" disabled={passSaving}>{passSaving ? 'Updating…' : 'Update password'}</button>
        </form>
      </section>
    </main>
  )
}
