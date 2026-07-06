'use client'
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useOrders } from '@/context/OrdersContext.jsx'
import { useToast } from '@/context/ToastContext.jsx'
import { BUSINESS_TYPES, dealBusinessType, itemMatchesBusiness } from '@/constants/businessTypes.js'
import { buildCategoryTabs, formatItemExtras, formatMoney } from '@/utils/formatting.js'

const SHOP_PHONE = '0315-9988295'

const CATEGORY_ICONS = {
  pizza: '🍕',
  burger: '🍔',
  fries: '🍟',
  wings: '🍗',
  shawarma: '🌯',
  roll: '🌯',
  drinks: '🥤',
  other: '🍽️',
}

const CATEGORY_COLORS = {
  pizza: '#8a1f1f',
  burger: '#c45c26',
  fries: '#b8860b',
  wings: '#6b3fa0',
  shawarma: '#1f7a5c',
  roll: '#1f7a5c',
  drinks: '#1f7a3c',
  other: '#55483c',
}

const DEAL_COLORS = ['#c42626', '#8a1f1f', '#c45c26', '#a01f3a', '#c42626', '#8a1f1f']

const DEAL_PHOTOS = ['/menu-board/pizza-photo.png', '/menu-board/burger-photo.png', '/menu-board/wings-photo.png', '/menu-board/drinks-photo.png']

function categoryIcon(key) {
  return CATEGORY_ICONS[key] || '🍽️'
}

function categoryColor(key) {
  return CATEGORY_COLORS[key] || CATEGORY_COLORS.other
}

function dealPhoto(deal, index) {
  const name = (deal.name || '').toLowerCase()
  if (name.includes('pizza')) return '/menu-board/pizza-photo.png'
  if (name.includes('burger')) return '/menu-board/burger-photo.png'
  if (name.includes('wing') || name.includes('broast')) return '/menu-board/wings-photo.png'
  if (name.includes('drink') || name.includes('cola') || name.includes('shawarma')) return '/menu-board/drinks-photo.png'
  return DEAL_PHOTOS[index % DEAL_PHOTOS.length]
}

function buildMenuBoardSections(items, business) {
  const byCat = new Map()
  for (const item of items) {
    if (business !== 'all' && !itemMatchesBusiness(item, business)) continue
    const k = item.category || 'other'
    if (!byCat.has(k)) byCat.set(k, [])
    byCat.get(k).push(item)
  }
  for (const list of byCat.values()) list.sort((a, b) => a.name.localeCompare(b.name))
  const tabs = buildCategoryTabs([...byCat.values()].flat())
  return tabs
    .map(({ key, label }) => ({ key, label, items: byCat.get(key) || [] }))
    .filter((section) => section.items.length > 0)
}

export default function MenuBoardPage() {
  const { menu, loading } = useOrders()
  const toast = useToast()
  const boardRef = useRef(null)
  const [business, setBusiness] = useState('all')
  const [downloading, setDownloading] = useState(false)

  const sections = useMemo(() => buildMenuBoardSections(menu.items, business), [menu.items, business])
  const itemById = useMemo(() => new Map(menu.items.map((i) => [i.id, i])), [menu.items])

  const activeDeals = useMemo(() => menu.deals.filter((d) => d.status !== 'archived'), [menu.deals])
  const visibleDeals = useMemo(() => {
    if (business === 'all') return activeDeals
    return activeDeals.filter((d) => {
      const bt = dealBusinessType(d, menu.items)
      return bt === business || bt === 'combined'
    })
  }, [activeDeals, business, menu.items])

  const ribbonLabel = business === 'burger' ? 'Burger' : business === 'cafe' ? 'Cafe' : 'Burger & Cafe'
  const hasContent = sections.length > 0 || visibleDeals.length > 0
  const gridDeals = visibleDeals.length > 1 ? visibleDeals.slice(0, -1) : visibleDeals
  const featuredDeal = visibleDeals.length > 1 ? visibleDeals[visibleDeals.length - 1] : null
  const featuredIndex = visibleDeals.length - 1

  async function downloadImage() {
    if (!boardRef.current || downloading) return
    setDownloading(true)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(boardRef.current, {
        backgroundColor: '#150b05',
        scale: 2,
        useCORS: true,
      })
      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = `chacha-menu-${business}.png`
      link.href = dataUrl
      link.click()
      toast.success('Menu image downloaded')
    } catch {
      toast.error('Could not generate the image. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <div className="page-hero">
        <div className="page-hero-deco" aria-hidden="true">🍕 🍔 🥤</div>
        <div className="page-hero-body">
          <div className="page-hero-icon">🖼️</div>
          <div>
            <h1 className="page-hero-title">Menu Board</h1>
            <p className="page-hero-sub">
              A ready-to-share menu built live from your items &amp; deals — download it as an image to print or post online.
            </p>
          </div>
        </div>
      </div>

      <main className="menu-board-page">
        <section className="card menu-board-toolbar">
          <div className="invoices-filter-tabs">
            <button type="button" className={business === 'all' ? 'primary sm' : 'ghost sm'} onClick={() => setBusiness('all')}>
              All
            </button>
            {BUSINESS_TYPES.map((bt) => (
              <button
                key={bt.id}
                type="button"
                className={business === bt.id ? 'primary sm' : 'ghost sm'}
                onClick={() => setBusiness(bt.id)}
              >
                {bt.shortLabel}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="primary sm"
            disabled={downloading || !hasContent}
            onClick={() => void downloadImage()}
          >
            {downloading ? 'Preparing image…' : '⬇ Download as image'}
          </button>
        </section>

        {loading ? (
          <p className="muted">Loading menu…</p>
        ) : !hasContent ? (
          <p className="muted">
            Nothing to show for this filter yet — add items from{' '}
            <Link href="/menu" className="inline-link">Menu items</Link>.
          </p>
        ) : (
          <div className="menu-board-wrap">
            <div className="menu-board-canvas" ref={boardRef}>
              <div className="menu-board-banner">
                <div className="menu-board-fresh-badge" aria-hidden="true">
                  <span>Always</span>
                  <strong>Fresh</strong>
                  <span>&amp; Delicious</span>
                </div>
                <img src="/menu-board/burger-photo.png" alt="" className="menu-board-photo menu-board-photo-left" aria-hidden="true" />
                <img src="/menu-board/pizza-photo.png" alt="" className="menu-board-photo menu-board-photo-right" aria-hidden="true" />
                <div className="menu-board-brand-row">
                  <img src="/menu-board/logo-emblem.png" alt="" className="menu-board-logo-emblem" aria-hidden="true" />
                  <h2 className="menu-board-brand-name">Chacha</h2>
                </div>
                <div className="menu-board-ribbon"><span>• {ribbonLabel.toUpperCase()} •</span></div>
                <p className="menu-board-brand-tag">Good Food • Good Mood</p>
                <div className="menu-board-phone">📞 {SHOP_PHONE}</div>
              </div>

              {sections.length > 0 ? (
                <div className="menu-board-sections">
                  {sections.map((section) => (
                    <div key={section.key} className="menu-board-section">
                      <div className="menu-board-section-head" style={{ background: categoryColor(section.key) }}>
                        <span className="menu-board-section-icon" aria-hidden="true">{categoryIcon(section.key)}</span>
                        <span className="menu-board-section-title">{section.label}</span>
                      </div>
                      <ul className="menu-board-item-list">
                        {section.items.map((item) => {
                          const extras = formatItemExtras(item)
                          return (
                            <li key={item.id} className="menu-board-item">
                              <div className="menu-board-item-name-wrap">
                                <span className="menu-board-item-name">{item.name}</span>
                                {extras ? <span className="menu-board-item-extras">{extras}</span> : null}
                              </div>
                              <span className="menu-board-item-dots" aria-hidden="true" />
                              <span className="menu-board-item-price">{formatMoney(item.price)}</span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}

              {visibleDeals.length > 0 ? (
                <div className="menu-board-deals">
                  <div className="menu-board-deals-ribbon"><span>• Special Deals •</span></div>
                  <div className="menu-board-deal-grid">
                    {gridDeals.map((deal, i) => {
                      const color = DEAL_COLORS[i % DEAL_COLORS.length]
                      return (
                        <div key={deal.id} className="menu-board-deal-card">
                          <div className="menu-board-deal-badge" style={{ background: color }}>
                            <span className="menu-board-deal-badge-label">Deal No. {i + 1}</span>
                            <span className="menu-board-deal-badge-price">{formatMoney(deal.price)}</span>
                          </div>
                          <ul className="menu-board-deal-includes">
                            {deal.includes.map((inc, idx) => {
                              const item = itemById.get(inc.itemId)
                              return (
                                <li key={`${deal.id}-${idx}`}>{inc.qty}× {item ? item.name : inc.itemId}</li>
                              )
                            })}
                          </ul>
                          <div className="menu-board-deal-photo-wrap">
                            <img src={dealPhoto(deal, i)} alt="" className="menu-board-deal-photo" aria-hidden="true" />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {featuredDeal ? (
                    <div className="menu-board-deal-featured" style={{ background: DEAL_COLORS[featuredIndex % DEAL_COLORS.length] }}>
                      <div className="menu-board-deal-featured-info">
                        <span className="menu-board-deal-featured-label">Deal No. {featuredIndex + 1}</span>
                        <span className="menu-board-deal-featured-price">{formatMoney(featuredDeal.price)}</span>
                      </div>
                      <ul className="menu-board-deal-featured-includes">
                        {featuredDeal.includes.map((inc, idx) => {
                          const item = itemById.get(inc.itemId)
                          return (
                            <li key={`${featuredDeal.id}-${idx}`}>{inc.qty}× {item ? item.name : inc.itemId}</li>
                          )
                        })}
                      </ul>
                      <img
                        src={dealPhoto(featuredDeal, featuredIndex)}
                        alt=""
                        className="menu-board-deal-featured-photo"
                        aria-hidden="true"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="menu-board-footer">
                <div className="menu-board-footer-badges">
                  <div className="menu-board-footer-badge">
                    <span className="menu-board-footer-badge-icon" aria-hidden="true">🌿</span>
                    <span>Fresh<br />Ingredients</span>
                  </div>
                  <div className="menu-board-footer-badge">
                    <span className="menu-board-footer-badge-icon" aria-hidden="true">🏅</span>
                    <span>Quality<br />Food</span>
                  </div>
                  <div className="menu-board-footer-badge">
                    <span className="menu-board-footer-badge-icon" aria-hidden="true">👌</span>
                    <span>Best<br />Taste</span>
                  </div>
                </div>
                <div className="menu-board-footer-thanks">Thank You! ❤️</div>
              </div>

              <div className="menu-board-contact-strip">
                <span>📞 {SHOP_PHONE}</span>
                <span className="menu-board-contact-sep">·</span>
                <span>Prices in PKR — menu may change without notice</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
