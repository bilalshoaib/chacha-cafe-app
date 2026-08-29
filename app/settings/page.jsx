'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/api.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { useBranding } from '@/context/BrandingContext.jsx'
import LocaleFields from '@/components/LocaleFields.jsx'

export default function SettingsPage() {
  const { user, refreshAuth } = useAuth()
  const branding = useBranding()
  const router = useRouter()

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

  // Seeded from the branding the server already resolved for this request, so
  // the pickers open on the café's real settings with no second fetch and no
  // flash of the wrong currency.
  const [currency, setCurrency] = useState(branding?.currency ?? 'PKR')
  const [locale, setLocale] = useState(branding?.locale ?? 'en-PK')
  const [regionMsg, setRegionMsg] = useState('')
  const [regionErr, setRegionErr] = useState('')
  const [regionSaving, setRegionSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    setProfileEmail(user.email ?? '')
    setProfileName(user.displayName ?? '')
  }, [user])

  useEffect(() => {
    if (!branding) return
    setCurrency(branding.currency)
    setLocale(branding.locale)
  }, [branding])

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

  async function saveRegion(e) {
    e.preventDefault(); setRegionErr(''); setRegionMsg(''); setRegionSaving(true)
    try {
      await api.saveRegionalSettings({ currency, locale })
      setRegionMsg('Saved. Prices and dates across the app now use these.')
      // Currency and language are resolved on the server and handed to the
      // page as branding, so a re-render alone would leave every price on
      // every other screen in the old currency until a full reload. Refreshing
      // the route re-runs the layout and repaints the app in one go.
      router.refresh()
    } catch (err) { setRegionErr(err.message || 'Could not save regional settings') }
    finally { setRegionSaving(false) }
  }

  return (
    <main className="settings-page">
      <div className="page-hero">
        <div className="page-hero-deco" aria-hidden="true">🔒 👤 ⚙️</div>
        <div className="page-hero-body">
          <div className="page-hero-icon">⚙️</div>
          <div>
            <h1 className="page-hero-title">Settings</h1>
            <p className="page-hero-sub">Manage your profile, password, and team accounts.</p>
          </div>
        </div>
        {/* A sibling of the body, not a child of it — which is how the Menu and
            Deals heroes place theirs. .page-hero spaces its children apart, so
            an action nested inside the body instead stopped wherever the
            subtitle ended and sat stranded against the title, mid-banner. */}
        <Link href="/orders" className="page-hero-action">← Back</Link>
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

      {user.role === 'super_admin' ? (
        <section className="card settings-card">
          <h3 className="sub">Currency &amp; language</h3>
          <p className="muted small">
            What this café trades in and how it writes numbers and dates. Applies everywhere —
            the till, the menu board, printed receipts and reports.
          </p>
          <form onSubmit={(e) => void saveRegion(e)} className="settings-form">
            <LocaleFields
              currency={currency}
              locale={locale}
              onCurrencyChange={setCurrency}
              onLocaleChange={setLocale}
              disabled={regionSaving}
            />
            {regionErr ? <p className="banner error" role="alert">{regionErr}</p> : null}
            {regionMsg ? <p className="banner success settings-banner-quiet" role="status">{regionMsg}</p> : null}
            <button
              type="submit"
              className="primary"
              disabled={regionSaving || (currency === branding?.currency && locale === branding?.locale)}
            >
              {regionSaving ? 'Saving…' : 'Save currency & language'}
            </button>
          </form>
        </section>
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
