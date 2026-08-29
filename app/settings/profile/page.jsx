'use client'
import { useEffect, useState } from 'react'
import { api } from '@/api.js'
import { useAuth } from '@/context/AuthContext.jsx'
import SettingsSubpage from '@/components/SettingsSubpage.jsx'

/** The signed-in account's own name and email. Every role has one. */
export default function ProfileSettingsPage() {
  const { user, refreshAuth } = useAuth()

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    setEmail(user.email ?? '')
    setName(user.displayName ?? '')
  }, [user])

  if (!user) return null

  async function save(e) {
    e.preventDefault(); setError(''); setMessage(''); setSaving(true)
    try {
      const { user: u } = await api.updateProfile({ email, displayName: name })
      setMessage('Profile saved.')
      await refreshAuth()
      if (u?.email) setEmail(u.email)
      if (u?.displayName != null) setName(u.displayName ?? '')
    } catch (err) { setError(err.message || 'Could not save profile') }
    finally { setSaving(false) }
  }

  return (
    <SettingsSubpage
      title="Profile"
      blurb="Your display name and the email address you sign in with."
    >
      <section className="card settings-card">
        <form onSubmit={(e) => void save(e)} className="settings-form">
          <label className="field">
            <span>Display name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={saving}
              placeholder="Shown on receipts or reports later"
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={saving}
              autoComplete="email"
            />
          </label>
          {error ? <p className="banner error" role="alert">{error}</p> : null}
          {message ? <p className="banner success settings-banner-quiet" role="status">{message}</p> : null}
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>
    </SettingsSubpage>
  )
}
