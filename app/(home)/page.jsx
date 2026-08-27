'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { useBranding } from '@/context/BrandingContext.jsx'
import { buildCategoryTabs, formatItemExtras, formatMoney } from '@/utils/formatting.js'
import Skeleton, { SkeletonStatus } from '@/components/Skeleton.jsx'

/**
 * A sentence about the café built from what it actually sells.
 *
 * This page used to carry a paragraph about pizzas, burgers, fries, wings,
 * shawarmas and rolls, written for the one café the app was built for. Every
 * café that has joined since has been describing that café's menu to its own
 * customers. A coffee house cannot advertise wings, so the copy is assembled
 * from the categories on the menu being shown and is right by construction.
 */
function aboutLine(name, sections) {
  const labels = sections.map((s) => s.label.toLowerCase())
  if (!labels.length) {
    return `Come in and order at the counter — everything on the menu is made to order.`
  }
  const shown = labels.slice(0, 4)
  const list = shown.length > 1
    ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
    : shown[0]
  return `${name} serves ${list}${labels.length > shown.length ? ' and more' : ''} — made to order for counter service and takeaway.`
}

export default function HomePage() {
  const { authenticated } = useAuth()
  const [menu, setMenu] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        // Read off window rather than useSearchParams(), which would put this
        // whole page behind a Suspense boundary for the sake of one optional
        // parameter. ?tenant= names a café for a visitor with no session; staff
        // and single-café installs need none.
        const slug = new URLSearchParams(window.location.search).get('tenant')
        const m = await api.getPublicMenu(slug)
        if (!cancelled) { setMenu(m); setError('') }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load menu.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // Re-resolved when the session changes: which café this is depends on who
    // is signed in, so signing in or out changes the answer.
  }, [authenticated])

  // The signed-in café comes from the layout, which resolved it on the server.
  // A signed-out visitor reading ?tenant= has no session, so the café travels
  // with the menu instead — without it this page greeted every café's
  // customers with the name of the café the app was first built for.
  const sessionBranding = useBranding()
  const branding = menu?.branding ?? sessionBranding

  // The colours are normally written into a :root block by the server-rendered
  // layout, which cannot know which café a signed-out ?tenant= visitor is
  // asking about. Setting the two custom properties here re-skins the whole
  // page — every other colour in the stylesheets is mixed from these — and is
  // a no-op when the layout already got it right.
  useEffect(() => {
    const b = menu?.branding
    if (!b?.primary || !b?.secondary) return undefined
    const root = document.documentElement
    const previous = [root.style.getPropertyValue('--brand-primary'), root.style.getPropertyValue('--brand-secondary')]
    root.style.setProperty('--brand-primary', b.primary)
    root.style.setProperty('--brand-secondary', b.secondary)
    return () => {
      root.style.setProperty('--brand-primary', previous[0])
      root.style.setProperty('--brand-secondary', previous[1])
    }
  }, [menu?.branding])

  // And the tab, for the same reason. generateMetadata() runs on the server
  // from the session, which a customer following a ?tenant= link does not
  // have, so their browser tab read the product's own name above the café's
  // own menu.
  useEffect(() => {
    if (menu?.branding?.name) document.title = menu.branding.name
  }, [menu?.branding?.name])

  const cafeName = branding?.name ?? ''

  const itemById = useMemo(() => new Map((menu?.items ?? []).map((i) => [i.id, i])), [menu?.items])

  const categorySections = useMemo(() => {
    if (!menu?.items?.length) return []
    const byCat = new Map()
    for (const item of menu.items) {
      const k = item.category || 'other'
      if (!byCat.has(k)) byCat.set(k, [])
      byCat.get(k).push(item)
    }
    for (const list of byCat.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    const tabs = buildCategoryTabs(menu.items, menu.categories)
    return tabs.map(({ key, label }) => {
      const items = byCat.get(key)
      return items?.length ? { key, label, items } : null
    }).filter(Boolean)
  }, [menu])

  const deals = useMemo(
    () => (menu?.deals ?? []).filter((d) => d.status !== 'archived'),
    [menu?.deals],
  )

  /**
   * The chips under the hero, from the café's own categories.
   *
   * These were five fixed chips — Burgers, Pizzas, Shawarma, Wings, Drinks —
   * so a café selling none of them advertised all five and then showed a menu
   * with none on it. Categories carry their own icon, which is what the café
   * chose when it made them, so the strip needs nothing new stored.
   */
  const categoryChips = useMemo(() => {
    const iconOf = new Map((menu?.categories ?? []).map((c) => [c.key, c.icon]))
    return categorySections.slice(0, 6).map(({ key, label }) => ({
      key, label, icon: iconOf.get(key) || null,
    }))
  }, [categorySections, menu?.categories])

  const menuBody = (
    <>
      {error ? <p className="banner error home-banner" role="alert">{error}</p> : null}

      {loading ? (
        // The menu's own shape — a couple of category blocks of priced rows —
        // so a customer opening this sees a menu arriving rather than a word.
        <section className="hp-section" aria-busy="true">
          <SkeletonStatus label="Loading menu…" />
          <div className="hp-menu-grid">
            {Array.from({ length: 2 }, (_, c) => (
              <div key={c} className="hp-menu-cat">
                <Skeleton width="8rem" height="1.1rem" />
                <ul className="hp-menu-list">
                  {Array.from({ length: 5 }, (_, i) => (
                    <li key={i} className="hp-menu-row">
                      <Skeleton width={`${45 + ((i * 13) % 30)}%`} height="0.95rem" />
                      <Skeleton width="3.5rem" height="0.95rem" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <>
          {deals.length > 0 ? (
            <section className="hp-section" id="deals">
              <div className="hp-section-head">
                <h2 className="hp-section-title">
                  <span className="hp-section-icon">🔥</span> Special Deals
                </h2>
                <p className="muted small">Bundles — one price for everything listed.</p>
              </div>
              <ul className="hp-deals-grid">
                {deals.map((deal) => (
                  <li key={deal.id} className="hp-deal-card">
                    <div className="hp-deal-badge">DEAL</div>
                    <div className="hp-deal-head">
                      <span className="hp-deal-name">{deal.name}</span>
                      <span className="hp-deal-price">{formatMoney(deal.price)}</span>
                    </div>
                    <p className="muted small hp-deal-includes-label">Includes</p>
                    <ul className="hp-deal-includes">
                      {deal.includes.map((inc, idx) => {
                        const item = itemById.get(inc.itemId)
                        const bits = item
                          ? [item.name, formatItemExtras(item)].filter(Boolean).join(' · ')
                          : inc.itemId
                        return <li key={`${deal.id}-${idx}`}><strong>{inc.qty}×</strong> {bits}</li>
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {categorySections.length > 0 ? (
            <section className="hp-section" id="menu">
              <div className="hp-section-head">
                <h2 className="hp-section-title">
                  <span className="hp-section-icon">🍽️</span> Our Menu
                </h2>
                <p className="muted small">Individual items and add-ons at counter prices.</p>
              </div>
              <div className="hp-menu-grid">
                {categorySections.map(({ key, label, items }) => (
                  <div key={key} className="hp-menu-cat">
                    <h3 className="hp-menu-cat-title">{label}</h3>
                    <ul className="hp-menu-list">
                      {items.map((item) => {
                        const extras = formatItemExtras(item)
                        return (
                          <li key={item.id} className="hp-menu-row">
                            <div className="hp-menu-row-main">
                              <span className="hp-menu-name">{item.name}</span>
                              {extras ? <span className="muted small">{extras}</span> : null}
                            </div>
                            <span className="hp-menu-price">{formatMoney(item.price)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <section className="hp-about">
        <div className="hp-about-inner">
          <h2 className="hp-about-title">{branding?.tagline || cafeName}</h2>
          <p className="hp-about-text">{aboutLine(cafeName, categorySections)}</p>
          <div className="hp-about-badges">
            <span className="hp-badge">🌿 Fresh Ingredients</span>
            <span className="hp-badge">⭐ Quality Food</span>
            <span className="hp-badge">⚡ Quick Service</span>
          </div>
        </div>
      </section>
    </>
  )

  if (!authenticated) {
    return (
      <div className="hp-shell">
        {/* ── Hero ── */}
        <div className="hp-hero" style={{ backgroundImage: 'url(/hero-bg.png)' }}>
          <div className="hp-hero-overlay" />
          <div className="hp-hero-content">
            <HeroMark branding={branding} />
            <div className="hp-hero-actions">
              <a href="#deals" className="hp-hero-btn-primary">View Deals</a>
              <a href="#menu" className="hp-hero-btn-ghost">Full Menu</a>
            </div>
          </div>
        </div>

        {/* ── Category strip ── */}
        {categoryChips.length ? (
          <div className="hp-cat-strip">
            {categoryChips.map(({ key, label, icon }) => (
              <div key={key} className="hp-cat-chip">
                {icon ? <span className="hp-cat-chip-icon">{icon}</span> : null}
                <span className="hp-cat-chip-label">{label}</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* ── Menu content ── */}
        <main className="hp-main">{menuBody}</main>

        <div className="hp-staff-bar">
          <span className="hp-staff-bar-text">Are you staff?</span>
          <Link href="/login" className="hp-staff-bar-link">Staff sign in →</Link>
        </div>

        <footer className="hp-footer">
          <div className="hp-footer-logo">
            <span className="hp-footer-name">{cafeName}</span>
          </div>
          {branding?.tagline ? <p className="hp-footer-tagline">{branding.tagline}</p> : null}
          <p className="hp-footer-copy muted small">Visit us at the cafe for counter service &amp; takeaway.</p>
        </footer>
      </div>
    )
  }

  return (
    <div className="hp-staff-shell">
      <div className="hp-staff-hero" style={{ backgroundImage: 'url(/hero-bg.png)' }}>
        <div className="hp-hero-overlay hp-hero-overlay--shallow" />
        <div className="hp-hero-content hp-hero-content--staff">
          <HeroMark branding={branding} small />
        </div>
      </div>
      <main className="hp-main hp-main--staff">{menuBody}</main>
    </div>
  )
}

/**
 * The name over the door: the café's logo when it has uploaded one, its name
 * in the display face either way, and its tagline underneath.
 *
 * All three used to be the words CHACHA / BURGER & CAFE / Good Food ★ Good
 * Mood, typed into the markup. The colours around them were already the
 * café's own — every shade on this page is mixed from its two brand
 * properties — which made the mismatch worse rather than better: a coffee
 * house got its own palette wrapped around somebody else's name.
 *
 * The name is sized from its own length rather than by a fixed clamp, so a
 * short one still fills the hero and a long one stays inside it instead of
 * running off the side.
 */
function HeroMark({ branding, small = false }) {
  const name = branding?.name ?? ''
  return (
    <>
      {branding?.logoUrl ? (
        <div className={`hp-hero-logo${small ? ' hp-hero-logo--sm' : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.logoUrl} alt={`${name} logo`} />
        </div>
      ) : null}
      <h1
        className={`hp-logo-name${small ? ' hp-logo-name--sm' : ''}`}
        style={{ '--name-chars': Math.max(name.length, 5) }}
      >
        {name}
      </h1>
      {branding?.tagline ? <p className="hp-logo-tagline">{branding.tagline}</p> : null}
    </>
  )
}
