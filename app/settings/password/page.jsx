'use client'
import { useState } from 'react'
import { api } from '@/api.js'
import { useAuth } from '@/context/AuthContext.jsx'
import SettingsSubpage from '@/components/SettingsSubpage.jsx'

/**
 * Changing your own password.
 *
 * A page of its own, and not merely because the settings screen was long: the
 * three password boxes were sitting under a form that autofilled an email
 * address, and browsers offered to save the wrong pair.
 */
export default function PasswordSettingsPage() {
  const { user } = useAuth()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!user) return null

  async function save(e) {
    e.preventDefault(); setError(''); setMessage('')
    if (next !== confirm) { setError('New passwords do not match.'); return }
    setSaving(true)
    try {
      await api.changeMyPassword(current, next)
      setMessage('Password updated.')
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err) { setError(err.message || 'Could not update password') }
    finally { setSaving(false) }
  }

  return (
    <SettingsSubpage
      title="Password"
      blurb="Change the password on this account. You need the current one to set a new one."
    >
      <section className="card settings-card">
        <form onSubmit={(e) => void save(e)} className="settings-form">
          <label className="field">
            <span>Current password</span>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              disabled={saving}
              autoComplete="current-password"
            />
          </label>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={8}
              disabled={saving}
              autoComplete="new-password"
            />
            <span className="muted small">At least 8 characters.</span>
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              disabled={saving}
              autoComplete="new-password"
            />
          </label>
          {error ? <p className="banner error" role="alert">{error}</p> : null}
          {message ? <p className="banner success settings-banner-quiet" role="status">{message}</p> : null}
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </section>
    </SettingsSubpage>
  )
}
