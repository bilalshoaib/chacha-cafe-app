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
        if (!cancelled) {
          setMenu(m)
          setError('')
        }
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
    for (const list of byCat.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    const tabs = buildCategoryTabs(menu.items)
    return tabs
      .map(({ key, label }) => {
        const items = byCat.get(key)
        return items?.length ? { key, label, items } : null
      })
      .filter(Boolean)
  }, [menu])

  const deals = menu?.deals ?? []

  const body = (
    <>
      <section className="home-hero card">
        <p className="home-hero-kicker">Welcome</p>
        <h2 className="home-hero-title">Fresh pizzas, burgers, shawarmas &amp; more</h2>
        <p className="home-hero-lede">
          We cook to order with quality ingredients. Browse our combo deals and full menu below — prices shown as
          served at the counter.
        </p>
        <ul className="home-hero-points">
          <li>Deals bundle your favourites at a set price</li>
          <li>Build your own order when you visit</li>
          <li>Ask staff about sizes, flavours, and daily specials</li>
        </ul>
      </section>

      {error ? (
        <p className="banner error home-banner" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="muted home-loading">Loading menu…</p>
      ) : (
        <>
          <section className="home-section" id="deals">
            <div className="home-section-head">
              <h3>Deals</h3>
              <p className="muted small">Bundles — one price for everything listed.</p>
            </div>
            {deals.length === 0 ? (
              <p className="muted home-empty">No deals listed yet. Check back soon.</p>
            ) : (
              <ul className="home-deals-grid">
                {deals.map((deal) => (
                  <li key={deal.id} className="card home-deal-card">
                    <div className="home-deal-head">
                      <span className="home-deal-name">{deal.name}</span>
                      <span className="home-deal-price">{formatMoney(deal.price)}</span>
                    </div>
                    <p className="muted small home-includes-label">Includes</p>
                    <ul className="home-deal-includes">
                      {deal.includes.map((inc, idx) => {
                        const item = itemById.get(inc.itemId)
                        const bits = item
                          ? [item.name, formatItemExtras(item)].filter(Boolean).join(' · ')
                          : inc.itemId
                        return (
                          <li key={`${deal.id}-${idx}`}>
                            <strong>{inc.qty}×</strong> {bits}
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="home-section" id="menu">
            <div className="home-section-head">
              <h3>Menu</h3>
              <p className="muted small">Individual items and add-ons.</p>
            </div>
            {categorySections.length === 0 ? (
              <p className="muted home-empty">No menu items to show yet.</p>
            ) : (
              <div className="home-menu-columns">
                {categorySections.map(({ key, label, items }) => (
                  <div key={key} className="card home-menu-category">
                    <h4 className="home-menu-cat-title">{label}</h4>
                    <ul className="home-menu-list">
                      {items.map((item) => {
                        const extras = formatItemExtras(item)
                        return (
                          <li key={item.id} className="home-menu-row">
                            <div className="home-menu-row-main">
                              <span className="home-menu-name">{item.name}</span>
                              {extras ? <span className="muted small home-menu-extras">{extras}</span> : null}
                            </div>
                            <span className="home-menu-price">{formatMoney(item.price)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <section className="card home-about">
        <h3 className="sub">About us</h3>
        <p className="muted">
          We are a neighbourhood cafe focused on pizzas, burgers, fries, wings, shawarmas, and rolls — made for quick
          counter service and takeaway. Visit us to place an order; our team uses this same menu at the register.
        </p>
      </section>
    </>
  )

  if (!authenticated) {
    return (
      <div className="home-public-shell">
        <header className="home-public-header">
          <div className="brand home-public-brand">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <h1>Chacha burger Cafe</h1>
              <p className="tagline">Pizzas, burgers, fries, wings, shawarmas &amp; rolls</p>
            </div>
          </div>
          <Link href="/login" className="primary sm home-staff-link">
            Staff sign in
          </Link>
        </header>
        <main className="home-page">{body}</main>
        <footer className="home-public-footer muted small">
          <span>Visit us at the cafe — hours and location can go here when you have them.</span>
        </footer>
      </div>
    )
  }

  return <main className="home-page home-page-staff">{body}</main>
}
