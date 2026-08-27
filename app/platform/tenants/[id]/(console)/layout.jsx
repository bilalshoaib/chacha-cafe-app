'use client'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { TenantConsoleProvider, useTenantConsole } from '@/context/TenantConsoleContext.jsx'
import { tenantAccess, trialDaysLeft } from '@/lib/tenantAccess.js'
import { formatShortDateTime } from '@/utils/formatting.js'

/**
 * The chrome around one café: who they are, what state they are in, and the
 * six places you can go.
 *
 * A route group rather than a plain layout, so that this wraps the six console
 * tabs and leaves /reports alone — the reports workbench is a full screen with
 * its own heading and back link, shared with the café's own settings, and
 * putting a second header above it would be two headers arguing.
 */
const TABS = [
  { seg: '',           label: 'Overview',   hint: 'How they are doing' },
  { seg: 'details',    label: 'Details',    hint: 'Name and web address' },
  { seg: 'appearance', label: 'Appearance', hint: 'Colours and logo' },
  { seg: 'billing',    label: 'Billing',    hint: 'Plan and price' },
  { seg: 'access',     label: 'Access',     hint: 'Trial, pause for payment, suspend' },
  { seg: 'support',    label: 'Support',    hint: 'Open their app, reissue a password' },
  { seg: 'trail',      label: 'Trail',      hint: 'Everything done to this café' },
]

/**
 * The café's own logo, or the gradient tile built from its two colours.
 *
 * Not BrandMark, which reads the *signed-in* café from context — here the
 * subject is a different café entirely, so the mark has to be handed the one
 * it is drawing.
 */
function TenantMark({ tenant }) {
  const style = {
    '--mark-a': tenant.brandPrimary || 'var(--brand-primary)',
    '--mark-b': tenant.brandSecondary || 'var(--brand-secondary)',
  }
  if (tenant.logoUrl) {
    return (
      <span className="tenant-mark tenant-mark-logo" style={style}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tenant.logoUrl} alt="" />
      </span>
    )
  }
  return (
    <span className="tenant-mark" style={style} aria-hidden="true">
      {(tenant.name ?? '?').trim().charAt(0).toUpperCase()}
    </span>
  )
}

function ConsoleChrome({ children }) {
  const { id } = useParams()
  const pathname = usePathname()
  const { tenant, error } = useTenantConsole()

  if (error && !tenant) {
    return <main className="platform-page"><p className="banner error">{error}</p></main>
  }
  if (!tenant) {
    return (
      <main className="platform-page">
        <div className="tenant-hero tenant-hero-skeleton" aria-hidden="true">
          <span className="tenant-mark tenant-mark-ghost" />
          <div className="tenant-hero-lines">
            <span className="skeleton" style={{ width: '13rem', height: '1.6rem' }} />
            <span className="skeleton" style={{ width: '20rem', height: '0.85rem' }} />
          </div>
        </div>
        <p className="platform-empty" role="status">Loading this café…</p>
      </main>
    )
  }

  const base = `/platform/tenants/${id}`
  const access = tenantAccess(tenant)
  const daysLeft = trialDaysLeft(tenant)
  // The status column and the access rule can disagree — a café still marked
  // "trial" whose trial ran out yesterday is one — and the badge has to show
  // the answer that decides whether they can work.
  const badge = !access.allowed && tenant.status === 'trial'
    ? { cls: 'restricted', label: 'trial ended' }
    : { cls: tenant.status, label: tenant.status }

  return (
    <main className="platform-page tenant-console">
      <Link href="/platform" className="platform-back">← All cafés</Link>

      <header className="tenant-hero" style={{ '--hero-tint': tenant.brandPrimary || 'var(--brand-primary)' }}>
        <TenantMark tenant={tenant} />
        <div className="tenant-hero-main">
          <h1>{tenant.name}</h1>
          <p className="tenant-hero-meta">
            <code>{tenant.slug}</code>
            <span className="tenant-hero-dot">·</span>
            <span className="tenant-hero-plan">{tenant.plan}</span>
            <span className="tenant-hero-dot">·</span>
            <span>since {formatShortDateTime(tenant.createdAt)}</span>
          </p>
          <div className="tenant-hero-badges">
            <span className={`pill pill-${badge.cls}`}>{badge.label}</span>
            {tenant.status === 'trial' && access.allowed && daysLeft != null ? (
              <span className="pill pill-trial">{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</span>
            ) : null}
            {tenant.status === 'restricted' ? <span className="pill pill-restricted">payment</span> : null}
          </div>
        </div>
        <div className="tenant-hero-actions">
          <Link href={`${base}/reports`} className="primary btn-link">Open reports</Link>
        </div>
      </header>

      {/* Not allowed is the one thing worth saying above the tabs: it explains
          every support call this café will make, whichever tab you are on. */}
      {!access.allowed ? (
        <p className="tenant-blocked-strip" role="status">
          <strong>They cannot sign in.</strong> {access.message}{' '}
          <Link href={`${base}/access`}>Put it right →</Link>
        </p>
      ) : null}

      <nav className="tenant-tabs" aria-label="Café sections">
        {TABS.map(({ seg, label, hint }) => {
          const href = seg ? `${base}/${seg}` : base
          const active = seg ? pathname === href : pathname === base
          return (
            <Link key={label} href={href} className="tenant-tab" aria-current={active ? 'page' : undefined} title={hint}>
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="tenant-tab-body">{children}</div>
    </main>
  )
}

export default function TenantConsoleLayout({ children }) {
  return (
    <TenantConsoleProvider>
      <ConsoleChrome>{children}</ConsoleChrome>
    </TenantConsoleProvider>
  )
}
