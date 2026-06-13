'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext.jsx'

export default function LoginPage() {
  const { authenticated, login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (authenticated) {
      router.replace('/orders')
    }
  }, [authenticated, router])

  if (authenticated) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      router.push('/orders')
    } catch (err) {
      setError(err.message || 'Could not sign in')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <div className="brand login-brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <h1>Chacha burger Cafe</h1>
          <p className="tagline">Sign in to continue</p>
        </div>
      </div>

      <p className="login-back-home">
        <Link href="/" className="foot-link">
          ← View menu &amp; deals
        </Link>
      </p>

      <section className="card login-card">
        <h2 className="login-heading">Sign in</h2>
        <p className="muted small login-lede">
          Super admin and staff use email and password. The first super admin is created automatically when the user list
          is empty (see server logs / env).
        </p>
        <form onSubmit={(e) => void handleSubmit(e)} className="login-form">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <div className="password-input-wrap">
              <input
                type={passwordVisible ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
                className="password-input-with-toggle"
              />
              <button
                type="button"
                className="password-toggle-eye"
                onClick={() => setPasswordVisible((v) => !v)}
                disabled={submitting}
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                aria-pressed={passwordVisible}
              >
                {passwordVisible ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>
          {error ? (
            <p className="banner error login-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="primary wide" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}
