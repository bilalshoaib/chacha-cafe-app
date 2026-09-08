'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext.jsx'
import { useBranding } from '@/context/BrandingContext.jsx'
import { OrdersProvider } from '@/context/OrdersContext.jsx'
import ImpersonationBanner from '@/components/ImpersonationBanner.jsx'
import BrandMark from '@/components/BrandMark.jsx'
import ThemeToggle from '@/components/ThemeToggle.jsx'
import NavPending from '@/components/NavPending.jsx'
import Skeleton from '@/components/Skeleton.jsx'
import RouteSkeleton from '@/components/RouteSkeleton.jsx'
import { ADD_MENU_ITEM_HASH } from '@/constants/categories.js'

/**
 * A tab in the header.
 *
 * NavPending is what makes a press visible before the screen it names arrives;
 * see the note on it for why that was needed at all.
 *
 * `active` overrides the path match for tabs whose section covers more than
 * their own href — Settings is current on /settings/team but not on
 * /settings/reports, which has a tab of its own.
 */
function NavLink({ href, children, className, onClick, end = false, active }) {
  const pathname = usePathname()
  let isActive
  if (active !== undefined) {
    isActive = active
  } else if (end) {
    isActive = pathname === href
  } else {
    isActive = pathname === href || pathname.startsWith(href + '/')
  }
  const cls = [isActive ? 'active' : '', className].filter(Boolean).join(' ') || undefined
  return (
    <Link href={href} className={cls} onClick={onClick}>
      {children}
      <NavPending />
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

  // One list, rendered twice — in the fixed sidebar and in the mobile drawer.
  // `onNavigate` closes the drawer; the sidebar passes nothing.
  //
  // The platform-console link the design's prototype shows in this sidebar is
  // deliberately absent: it exists only in the prototype. A platform owner
  // signs in like anyone else and AppShell's `runningPlatform` branch hands
  // them the console; there is no café nav for them to see this from.
  const renderLinks = (onNavigate) => (
    <>
      <NavLink href="/" end onClick={onNavigate}>Home</NavLink>
      <NavLink href="/orders" end onClick={onNavigate}>Take order</NavLink>
      <NavLink href="/deals" onClick={onNavigate}>Create deal</NavLink>
      <NavLink href="/menu" onClick={onNavigate}>Menu items</NavLink>
      <NavLink href="/invoices" active={invoicesActive} onClick={onNavigate}>Invoices</NavLink>
      {user?.role !== 'counter_cashier' ? (
        <NavLink href="/expenses" active={expensesActive} onClick={onNavigate}>Expenses</NavLink>
      ) : null}
      <NavLink href="/settings" active={settingsActive} onClick={onNavigate}>Settings</NavLink>
      {user?.role === 'super_admin' ? (
        <NavLink href="/settings/reports" onClick={onNavigate}>Reports</NavLink>
      ) : null}
    </>
  )

  return (
    <>
      {/* Mobile-only strip: brand on the left, hamburger on the right. The
          fixed sidebar takes its place from 900px up. */}
      <div className="mobile-topbar">
        <div className="brand">
          <BrandMark />
          <h1>{branding?.name}</h1>
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
      </div>

      <aside className="side-nav">
        <div className="side-nav-brand">
          <BrandMark />
          <div className="side-nav-brand-text">
            <div className="side-nav-name">{branding?.name}</div>
            {branding?.tagline ? (
              <div className="side-nav-sub">{branding.tagline}</div>
            ) : (
              <div className="side-nav-sub">Point of sale</div>
            )}
          </div>
        </div>
        <nav className="side-nav-links" aria-label="Main">{renderLinks()}</nav>
        <div className="side-nav-footer">
          {/* No "Platform console" link here on purpose. A platform owner with
              no café is routed straight to the console by middleware and never
              renders this nav; one who has opened a café is impersonating, and
              the ImpersonationBanner's "Exit" is their way back. The prototype's
              always-on link was a prototype convenience. */}
          <ThemeToggle />
          <button type="button" className="side-nav-logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </aside>

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
        <div className="mobile-nav-links">{renderLinks(closeNav)}</div>
        <div className="mobile-nav-footer">
          <ThemeToggle />
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
    // The login screen is the one place this must not draw a header: it has no
    // café to name yet, and sketching one above the sign-in form would promise
    // an app the visitor is not in. There it waits blank rather than lying
    // about what is coming.
    if (pathname === '/login') return <div className="app" />
    return (
      <div className="app-shell">
        <aside className="side-nav" aria-hidden="true">
          <div className="side-nav-brand">
            <Skeleton width="2.1rem" height="2.1rem" className="skeleton-brand-mark" />
            <div className="skeleton-brand-lines">
              <Skeleton width="7rem" height="1rem" />
              <Skeleton width="4.5rem" height="0.65rem" />
            </div>
          </div>
          <div className="side-nav-links">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} width="100%" height="2rem" />
            ))}
          </div>
        </aside>
        <div className="app-main">
          <RouteSkeleton />
        </div>
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
      <div className="app app--platform">
        <ImpersonationBanner />
        <PlatformNav onLogout={() => void handleLogout()} />
        {children}
      </div>
    )
  }

  return (
    <OrdersProvider key={tenantKey}>
      <div className="app-shell">
        <AppNav user={user} onLogout={() => void handleLogout()} />
        <div className="app-main">
          <ImpersonationBanner />
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
      </div>
    </OrdersProvider>
  )
}
