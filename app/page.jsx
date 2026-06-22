'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { buildCategoryTabs, formatItemExtras, formatMoney } from '@/utils/formatting.js'

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
        const m = await api.getMenu()
        if (!cancelled) { setMenu(m); setError('') }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load menu.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

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
    const tabs = buildCategoryTabs(menu.items)
    return tabs.map(({ key, label }) => {
      const items = byCat.get(key)
      return items?.length ? { key, label, items } : null
    }).filter(Boolean)
  }, [menu])

  const deals = useMemo(
    () => (menu?.deals ?? []).filter((d) => d.status !== 'archived'),
    [menu?.deals],
  )

  const menuBody = (
    <>
      {error ? <p className="banner error home-banner" role="alert">{error}</p> : null}

      {loading ? (
        <p className="muted home-loading hp-loading-text">Loading menu…</p>
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
          <h2 className="hp-about-title">Always Fresh &amp; Delicious</h2>
          <p className="hp-about-text">
            We are a neighbourhood cafe focused on pizzas, burgers, fries, wings, shawarmas, and rolls —
            made with quality ingredients for quick counter service and takeaway. Visit us to place an order.
          </p>
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
            <div className="hp-hero-kicker">★ Always Fresh &amp; Delicious ★</div>
            <h1 className="hp-logo-chacha">CHACHA</h1>
            <div className="hp-logo-sub">
              <span className="hp-logo-star">★</span>
              BURGER &amp; CAFE
              <span className="hp-logo-star">★</span>
            </div>
            <p className="hp-logo-tagline">Good Food ★ Good Mood</p>
            <div className="hp-hero-actions">
              <a href="#deals" className="hp-hero-btn-primary">View Deals</a>
              <a href="#menu" className="hp-hero-btn-ghost">Full Menu</a>
            </div>
          </div>
        </div>

        {/* ── Category strip ── */}
        <div className="hp-cat-strip">
          {[
            { icon: '🍔', label: 'Burgers' },
            { icon: '🍕', label: 'Pizzas' },
            { icon: '🌯', label: 'Shawarma' },
            { icon: '🍗', label: 'Wings' },
            { icon: '🥤', label: 'Drinks' },
          ].map(({ icon, label }) => (
            <div key={label} className="hp-cat-chip">
              <span className="hp-cat-chip-icon">{icon}</span>
              <span className="hp-cat-chip-label">{label}</span>
            </div>
          ))}
        </div>

        {/* ── Menu content ── */}
        <main className="hp-main">{menuBody}</main>

        <div className="hp-staff-bar">
          <span className="hp-staff-bar-text">Are you staff?</span>
          <Link href="/login" className="hp-staff-bar-link">Staff sign in →</Link>
        </div>

        <footer className="hp-footer">
          <div className="hp-footer-logo">
            <span className="hp-footer-chacha">CHACHA</span>
            <span className="hp-footer-cafe"> BURGER &amp; CAFE</span>
          </div>
          <p className="hp-footer-tagline">Good Food ★ Good Mood</p>
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
          <h1 className="hp-logo-chacha hp-logo-chacha--sm">CHACHA</h1>
          <div className="hp-logo-sub hp-logo-sub--sm">
            <span className="hp-logo-star">★</span> BURGER &amp; CAFE <span className="hp-logo-star">★</span>
          </div>
          <p className="hp-logo-tagline">Good Food ★ Good Mood</p>
        </div>
      </div>
      <main className="hp-main hp-main--staff">{menuBody}</main>
    </div>
  )
}
