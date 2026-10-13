'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext.jsx'
import { useBranding } from '@/context/BrandingContext.jsx'
import BrandMark from '@/components/BrandMark.jsx'
import ThemeToggle from '@/components/ThemeToggle.jsx'
import NavPending from '@/components/NavPending.jsx'

/**
 * The header-style navigation, chosen on Settings → Appearance.
 *
 * The same sections as the sidebar, in the same order, laid along the top as
 * plain words with an underline for the current one; the account — the theme,
 * appearance, signing out — sits behind the avatar the way it does on any
 * website.
 *
 * Always rendered beside the sidebar and shown by CSS on data-nav="top"
 * (app/styles/03-components.css), never chosen in JavaScript: the choice is
 * read from localStorage before first paint by app/layout.jsx, and deciding it
 * here instead would draw the wrong navigation until hydration.
 *
 * `items` is a list of links ({ href, label, end?, active? }). `cta` is an
 * optional link drawn as a button. `accountLinks` are the links in the
 * avatar's menu.
 */

function isLinkActive(pathname, link) {
  if (link.active !== undefined) return link.active
  if (link.end) return pathname === link.href
  return pathname === link.href || pathname.startsWith(link.href + '/')
}

/** Closes on a click elsewhere, on Escape, and on navigating. */
function useDismiss(open, setOpen, ref) {
  const pathname = usePathname()
  useEffect(() => { setOpen(false) }, [pathname, setOpen])
  useEffect(() => {
    if (!open) return
    function onPointer(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen, ref])
}

function TopLink({ link }) {
  const pathname = usePathname()
  const active = isLinkActive(pathname, link)
  return (
    <Link href={link.href} className={`tn-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
      {link.label}
      <NavPending />
    </Link>
  )
}

function AccountMenu({ accountLinks, onLogout, subtitle }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useDismiss(open, setOpen, ref)

  const name = user?.displayName || user?.email || 'Account'
  const initials = name
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?'

  return (
    <div className="tn-account" ref={ref}>
      <button
        type="button"
        className={`tn-avatar${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
      >
        {initials}
      </button>
      {open ? (
        <div className="tn-menu tn-menu--right" role="menu">
          <div className="tn-account-head">
            <span className="tn-avatar tn-avatar--lg" aria-hidden="true">{initials}</span>
            <span className="tn-menu-text">
              <span className="tn-menu-label">{user?.displayName || 'Signed in'}</span>
              <span className="tn-menu-hint">{subtitle ?? user?.email}</span>
            </span>
          </div>
          {accountLinks.map((l) => (
            <Link key={l.href} href={l.href} role="menuitem" className="tn-menu-item">
              <span className="tn-menu-icon" aria-hidden="true">{l.icon}</span>
              <span className="tn-menu-label">{l.label}</span>
              <NavPending />
            </Link>
          ))}
          <div className="tn-menu-theme"><ThemeToggle /></div>
          <button type="button" role="menuitem" className="tn-menu-item tn-menu-logout" onClick={onLogout}>
            <span className="tn-menu-icon" aria-hidden="true">↪</span>
            <span className="tn-menu-label">Log out</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default function TopNav({ items, cta, accountLinks = [], onLogout, tagline, accountSubtitle }) {
  const branding = useBranding()
  return (
    <header className="top-nav">
      <div className="tn-inner">
        <Link href={items[0]?.href ?? '/'} className="tn-brand">
          <BrandMark />
          <span className="tn-brand-text">
            <span className="tn-brand-name">{branding?.name}</span>
            {tagline ? <span className="tn-brand-sub">{tagline}</span> : null}
          </span>
        </Link>

        <nav className="tn-links" aria-label="Main">
          {items.map((it) => <TopLink key={it.href} link={it} />)}
        </nav>

        <div className="tn-actions">
          {cta ? (
            <Link href={cta.href} className="tn-cta">
              <span aria-hidden="true">＋</span> {cta.label}
              <NavPending />
            </Link>
          ) : null}
          <AccountMenu accountLinks={accountLinks} onLogout={onLogout} subtitle={accountSubtitle} />
        </div>
      </div>
    </header>
  )
}
