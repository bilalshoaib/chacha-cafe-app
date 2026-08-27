'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext.jsx'
import { useBranding } from '@/context/BrandingContext.jsx'
import BrandMark from '@/components/BrandMark.jsx'
import { takeSignedOutNotice } from '@/utils/signedOutNotice.js'

export default function LoginPage() {
  const branding = useBranding()
  const { authenticated, login } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Why they are looking at this screen, when they did not ask to be.
  // Written by AuthContext at the moment the session ended and read once here.
  // In state rather than read during render, because sessionStorage does not
  // exist on the server and the two renders would otherwise disagree.
  const [notice, setNotice] = useState('')
  useEffect(() => {
    setNotice(takeSignedOutNotice())
  }, [])

  // Set the moment a sign-in succeeds, so the effect below leaves the handover
  // alone: the two would otherwise navigate at once, and a client-side replace
  // landing first is exactly the stale render this is here to avoid.
  const [handingOff, setHandingOff] = useState(false)

  useEffect(() => {
    if (authenticated && !handingOff) {
      router.replace('/orders')
    }
  }, [authenticated, handingOff, router])

  if (authenticated) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      const { user } = await login(email, password)
      // Somebody who runs the platform rather than a café lands on the café
      // list; there is no till for them to stand at.
      const destination = user?.platformOwner && !user?.tenantId ? '/platform' : '/orders'

      // A full document load rather than router.push() + router.refresh().
      //
      // The café's name, colours, tagline and logo are resolved on the server
      // in app/layout.jsx, from the session — which this request has only just
      // created. A client-side navigation re-runs the page but leaves the root
      // layout's already-rendered body in place, so the header kept the
      // product's own name and palette until something forced a reload; a
      // refresh() alongside it updated the tab title and nothing else, which
      // made the bug look intermittent rather than total.
      //
      // Signing in is the one moment in the app where a full load costs
      // nothing and settles everything: the layout, the CSS custom properties,
      // the favicon and every cached client context are rebuilt for the café
      // that just signed in.
      setHandingOff(true)
      window.location.assign(destination)
      // Deliberately no setSubmitting(false) after this: the page is on its way
      // out, and re-enabling the button would invite a second sign-in.
      return
    } catch (err) {
      setError(err.message || 'Could not sign in')
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <div className="brand login-brand">
        <BrandMark />
        <div>
          <h1>{branding?.name}</h1>
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
        {/* Above the form, not beside the button: whoever is reading it was
            working a second ago and has just been stopped, and the first
            question is what happened rather than what to type. It is dropped
            as soon as they try to sign in, where the server answers with the
            same reason and that answer is the fresher one. */}
        {notice && !error ? (
          <p className="banner error login-error" role="alert">
            {notice}
          </p>
        ) : null}
        {/* This used to explain how the very first super admin gets bootstrapped
            from an environment variable — a note written for whoever was
            deploying the app, left on the screen a café's cashier sees at the
            start of every shift. They have been handed a login by their owner;
            what they need is where to ask when it does not work. */}
        <p className="muted small login-lede">
          Use the email and password your café gave you. Forgotten it? Whoever manages your café can set a new one
          from Settings → Team &amp; admins.
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
