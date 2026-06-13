'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext.jsx'
import { OrdersProvider } from '@/context/OrdersContext.jsx'
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

function AppNav({ user, onLogout }) {
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
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Chacha burger Cafe</h1>
            <p className="tagline">Pizzas, burgers, fries, wings, shawarmas &amp; rolls</p>
          </div>
        </div>

        <div className="top-header-right top-header-desktop">
          <nav className="tabs" aria-label="Main">
            <NavLink href="/" end>Home</NavLink>
            <NavLink href="/orders" end>Take order</NavLink>
            <NavLink href="/deals">Create deal</NavLink>
            <NavLink href="/menu">Menu items</NavLink>
            <Link href="/invoices" className={invoicesActive ? 'active' : undefined}>Invoices</Link>
            <Link href="/expenses" className={expensesActive ? 'active' : undefined}>Expenses</Link>
            <Link href="/settings" className={settingsActive ? 'active' : undefined}>Settings</Link>
            {user?.role === 'super_admin' ? (
              <NavLink href="/settings/reports">Reports</NavLink>
            ) : null}
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
          <Link href="/expenses" className={expensesActive ? 'active' : undefined} onClick={closeNav}>Expenses</Link>
          <Link href="/settings" className={settingsActive ? 'active' : undefined} onClick={closeNav}>Settings</Link>
          {user?.role === 'super_admin' ? (
            <NavLink href="/settings/reports" onClick={closeNav}>Reports</NavLink>
          ) : null}
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
  const router = useRouter()
  const pathname = usePathname()

  async function handleLogout() {
    await logout()
    router.push('/login')
  }

  if (authLoading) {
    return (
      <div className="app shell">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <OrdersProvider>
        <div className="app">{children}</div>
      </OrdersProvider>
    )
  }

  return (
    <OrdersProvider>
      <div className="app">
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
