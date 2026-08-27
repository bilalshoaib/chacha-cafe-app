'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext.jsx'
import { useBranding } from '@/context/BrandingContext.jsx'
import { OrdersProvider } from '@/context/OrdersContext.jsx'
import ImpersonationBanner from '@/components/ImpersonationBanner.jsx'
import BrandMark from '@/components/BrandMark.jsx'
import { ADD_MENU_ITEM_HASH } from '@/constants/categories.js'

function NavLink({ href, children, className, onClick, end = false }) {
  const pathname = usePathname()
  let isActive
  if (end) {
    isActive = pathname === href
  } else {
    isActive = pathname === href || pathname.startsWith(href + '/')
  }
  const cls = [isActive ? 'active' : '', className].filter(Boolean).join(' ') || undefined
  return (
    <Link href={href} className={cls} onClick={onClick}>
      {children}
    </Link>
  )
}

/**
 * The navigation for somebody who runs the platform rather than a café.
 *
 * The till's tabs — Take order, Create deal, Menu items — are not merely
 * useless here, they are unreachable: every one of those screens needs a
 * tenant, and middleware sends this account back to the café list. Showing
 * them offered seven links that all bounce.
 */
function PlatformNav({ onLogout }) {
  const branding = useBranding()
  return (
    <header className="top">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <h1>{branding?.name}</h1>
          <p className="tagline">Platform administration</p>
        </div>
      </div>
      <div className="top-header-right">
        <nav className="tabs" aria-label="Main">
          <NavLink href="/platform" end>Cafés</NavLink>
          <NavLink href="/platform/finance">Books</NavLink>
        </nav>
        <button type="button" className="ghost sm header-logout" onClick={onLogout}>Log out</button>
      </div>
    </header>
  )
}

function AppNav({ user, onLogout }) {
  const branding = useBranding()
  const pathname = usePathname()
  const [navOpen, setNavOpen] = useState(false)
  const closeNav = () => setNavOpen(false)

  const invoicesActive = pathname === '/invoices' || pathname.startsWith('/invoices/')
  const expensesActive = pathname === '/expenses' || pathname.startsWith('/expenses/')
  const settingsActive = pathname.startsWith('/settings') && !pathname.startsWith('/settings/reports')

  return (
    <>
      <header className="top">
        <div className="brand">
          <BrandMark />
          <div>
            <h1>{branding?.name}</h1>
            {branding?.tagline ? <p className="tagline">{branding.tagline}</p> : null}
          </div>
        </div>

        <div className="top-header-right top-header-desktop">
          <nav className="tabs" aria-label="Main">
            <NavLink href="/" end>Home</NavLink>
            <NavLink href="/orders" end>Take order</NavLink>
            <NavLink href="/deals">Create deal</NavLink>
            <NavLink href="/menu">Menu items</NavLink>
            <Link href="/invoices" className={invoicesActive ? 'active' : undefined}>Invoices</Link>
            {user?.role !== 'counter_cashier' ? (
              <Link href="/expenses" className={expensesActive ? 'active' : undefined}>Expenses</Link>
            ) : null}
            <Link href="/settings" className={settingsActive ? 'active' : undefined}>Settings</Link>
            {user?.role === 'super_admin' ? (
              <NavLink href="/settings/reports">Reports</NavLink>
            ) : null}
            {user?.platformOwner ? <NavLink href="/platform">Cafés</NavLink> : null}
          </nav>
          <button type="button" className="ghost sm header-logout" onClick={onLogout}>
            Log out
          </button>
        </div>

        <button
          type="button"
          className="hamburger-btn"
          aria-label="Open navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
        >
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
        </button>
      </header>

      {navOpen && (
        <div className="mobile-nav-overlay" onClick={closeNav} aria-hidden="true" />
      )}
      <nav
        className={`mobile-nav-drawer${navOpen ? ' mobile-nav-open' : ''}`}
        aria-label="Mobile navigation"
      >
        <div className="mobile-nav-header">
          <span className="mobile-nav-title">Menu</span>
          <button type="button" className="mobile-nav-close" aria-label="Close navigation" onClick={closeNav}>
            ✕
          </button>
        </div>
        <div className="mobile-nav-links">
          <NavLink href="/" end onClick={closeNav}>Home</NavLink>
          <NavLink href="/orders" end onClick={closeNav}>Take order</NavLink>
          <NavLink href="/deals" onClick={closeNav}>Create deal</NavLink>
          <NavLink href="/menu" onClick={closeNav}>Menu items</NavLink>
          <Link href="/invoices" className={invoicesActive ? 'active' : undefined} onClick={closeNav}>Invoices</Link>
          {user?.role !== 'counter_cashier' ? (
            <Link href="/expenses" className={expensesActive ? 'active' : undefined} onClick={closeNav}>Expenses</Link>
          ) : null}
          <Link href="/settings" className={settingsActive ? 'active' : undefined} onClick={closeNav}>Settings</Link>
          {user?.role === 'super_admin' ? (
            <NavLink href="/settings/reports" onClick={closeNav}>Reports</NavLink>
          ) : null}
          {user?.platformOwner ? <NavLink href="/platform" onClick={closeNav}>Cafés</NavLink> : null}
        </div>
        <div className="mobile-nav-footer">
          <button type="button" className="mobile-nav-logout" onClick={() => { closeNav(); onLogout() }}>
            Log out
          </button>
        </div>
      </nav>
    </>
  )
}

export default function AppShell({ children }) {
  const { authenticated, authLoading, user, logout } = useAuth()
  const pathname = usePathname()

  async function handleLogout() {
    await logout()
    // A full document load, for the same reason sign-in does one: the layout
    // resolves the café's name, colours and logo on the server, and a
    // client-side navigation leaves that already-rendered layout in place. The
    // sign-in page would otherwise keep wearing the café that just signed out,
    // and the next café to sign in would inherit it.
    window.location.assign('/login')
  }

  // Every open cart, the menu and the café's items live in OrdersProvider, and
  // none of them survive a change of café. Keying the provider on which café is
  // being acted as makes React throw the old one away and mount a clean one —
  // on sign-in, on sign-out, and when a support session opens or drops. Before
  // this, signing out of one café and into another left the first café's menu
  // and its half-built orders on screen until the page was reloaded by hand.
  const tenantKey = user?.effectiveTenantId ?? user?.tenantId ?? 'signed-out'

  if (authLoading) {
    return (
      <div className="app shell">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (!authenticated) {
    // Home page is full-screen (has its own layout); other public pages still get the app wrapper
    const isHome = pathname === '/'
    return (
      <OrdersProvider key={tenantKey}>
        {isHome ? children : <div className="app">{children}</div>}
      </OrdersProvider>
    )
  }

  // No café of their own and none opened: the platform's own chrome. Opening a
  // café gives the session a tenant, and everything below renders as usual.
  const runningPlatform = user?.platformOwner && !user?.effectiveTenantId

  if (runningPlatform) {
    return (
      <div className="app">
        <ImpersonationBanner />
        <PlatformNav onLogout={() => void handleLogout()} />
        {children}
      </div>
    )
  }

  return (
    <OrdersProvider key={tenantKey}>
      <div className="app">
        <ImpersonationBanner />
        <AppNav user={user} onLogout={() => void handleLogout()} />
        {children}
        {pathname !== '/' ? (
          <footer className="foot">
            <span>
              <Link href={`/menu${ADD_MENU_ITEM_HASH}`} className="foot-link">
                Add menu item
              </Link>
            </span>
          </footer>
        ) : null}
      </div>
    </OrdersProvider>
  )
}
