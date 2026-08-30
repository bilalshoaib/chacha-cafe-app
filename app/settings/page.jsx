'use client'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext.jsx'
import { useBranding, useMoney } from '@/context/BrandingContext.jsx'
import { currencyInfo } from '@/constants/locales.js'

/**
 * Settings, as a hub rather than a screen.
 *
 * It used to be one page holding five things at once — currency, language,
 * sales tax, profile, password — and each of them was a form with its own
 * submit button, its own error banner and its own success banner, stacked in a
 * single column. Three of the five could be saved from the same screenful, so
 * "Saved." could appear next to a form that had not been touched, and finding
 * the password fields meant scrolling past the tax rates.
 *
 * Each thing now gets a page. This one lists them and says what each is for,
 * which is also what makes the list additable: tipping and card payments are
 * next, and neither has anywhere to go on a screen that is already full.
 */

/** The rows in the hub. `owner` marks the ones only the café's owner may open. */
const SECTIONS = [
  {
    href: '/settings/profile',
    icon: '👤',
    title: 'Profile',
    blurb: 'Your display name and the email address you sign in with.',
  },
  {
    href: '/settings/password',
    icon: '🔑',
    title: 'Password',
    blurb: 'Change the password on this account. Needs your current one.',
  },
  {
    href: '/settings/tax',
    icon: '🧾',
    title: 'Sales tax',
    blurb: 'The rates you charge, who they apply to, and whether your menu prices already include them.',
    owner: true,
  },
  {
    href: '/settings/close',
    icon: '🌙',
    title: 'End of day',
    blurb: 'Count the drawer, close the trading day, and keep the difference between what the till says and what is actually there.',
    owner: true,
  },
  {
    href: '/settings/team',
    icon: '👥',
    title: 'Team & admins',
    blurb: 'Staff and admin logins: add an account, change a role, reset a password.',
    owner: true,
  },
  {
    href: '/settings/reports',
    icon: '📊',
    title: 'Sales & expense reports',
    blurb: 'Invoices and expenses by date range — net sales, tax collected, returns and what is left after expenses.',
    owner: true,
  },
]

export default function SettingsPage() {
  const { user } = useAuth()
  const branding = useBranding()
  const money = useMoney()

  if (!user) return null

  const isOwner = user.role === 'super_admin'
  const sections = SECTIONS.filter((s) => !s.owner || isOwner)
  const currency = currencyInfo(branding?.currency)

  return (
    <main className="settings-page">
      <div className="page-hero">
        <div className="page-hero-deco" aria-hidden="true">🔒 👤 ⚙️</div>
        <div className="page-hero-body">
          <div className="page-hero-icon">⚙️</div>
          <div>
            <h1 className="page-hero-title">Settings</h1>
            <p className="page-hero-sub">
              {isOwner
                ? 'Your account, your team, and how this café charges.'
                : 'Your account.'}
            </p>
          </div>
        </div>
        {/* A sibling of the body, not a child of it — which is how the Menu and
            Deals heroes place theirs. .page-hero spaces its children apart, so
            an action nested inside the body instead stopped wherever the
            subtitle ended and sat stranded against the title, mid-banner. */}
        <Link href="/orders" className="page-hero-action">← Back</Link>
      </div>

      <div className="settings-grid">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="card settings-tile">
            <span className="settings-tile-icon" aria-hidden="true">{s.icon}</span>
            <span className="settings-tile-body">
              <strong className="settings-tile-title">{s.title}</strong>
              <span className="muted small settings-tile-blurb">{s.blurb}</span>
            </span>
            <span className="settings-tile-chevron" aria-hidden="true">→</span>
          </Link>
        ))}
      </div>

      {/*
        Shown, not offered. The currency is the platform owner's to set — it is
        chosen when the café is created and changed from their console — because
        a café does not change the money it trades in while it is trading, and
        the one time it happens the owner is already on the phone to them.
        Leaving it off this screen entirely would be worse: an owner who thinks
        their prices are in the wrong currency needs to see what it is set to
        before they can say so.
      */}
      {isOwner ? (
        <section className="card settings-card settings-region-card">
          <h3 className="sub">Currency</h3>
          <div className="settings-region-row">
            <span className="settings-region-symbol" aria-hidden="true">{currency.symbol}</span>
            <div>
              <strong>{currency.name} ({currency.code})</strong>
              <p className="muted small">
                Prices read {money(1234.56)} across the till, the menu board, receipts and reports.
              </p>
            </div>
          </div>
          <p className="muted small">
            Set by your provider when this café was created. Ask them to change it if it is wrong —
            it moves every price on every screen at once, so it is not something to change mid-shift.
          </p>
        </section>
      ) : null}
    </main>
  )
}
