'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import OfflineBanner from '@/components/OfflineBanner.jsx'
import { SkeletonStatus } from '@/components/Skeleton.jsx'
import { categoryColor, categoryIcon, categoryLabel, formatItemExtras } from '@/utils/formatting.js'
import { discountPartsOf } from '@/lib/pricing.js'
import { MAX_TABLE_NUMBER } from '@/lib/tableNumber.js'
import { useOrders } from '@/context/OrdersContext.jsx'
import { useMoney } from '@/context/BrandingContext.jsx'

/**
 * The till as the big chains run it: categories down the side, the menu as a
 * wall of buttons, and the ticket building up on the right.
 *
 * An experiment alongside /orders, not a replacement. It sells through the
 * same OrdersContext — the same cart, the same checkout, the same offline
 * queue — so a sale rung up here is indistinguishable from one rung up there,
 * and an order started on one screen can be finished on the other.
 *
 * One tap adds one. Tapping something already on the ticket bumps its
 * quantity rather than adding a second row, which is what a cashier pressing
 * "Cola" three times means.
 */

const ORDER_TYPES = [
  { value: 'dine_in', label: 'Dine In', icon: '🍽️' },
  { value: 'takeaway', label: 'Takeaway', icon: '🛍️' },
  { value: 'delivery', label: 'Delivery', icon: '🛵' },
]

const DEALS_KEY = '__deals'
const ALL_KEY = '__all'

export default function QuickOrderPage() {
  const money = useMoney()
  const {
    menu,
    categoryTabs,
    activeOrder,
    activeOrderId,
    orderTotal,
    orderTax,
    orderGrandTotal,
    loading,
    customerNote,
    setCustomerNote,
    orderType,
    setOrderType,
    tableNumber,
    setTableNumber,
    deliveryCharge,
    setDeliveryCharge,
    checkingOut,
    openingInvoiceId,
    error,
    startNewOrder,
    addItemToOrder,
    addDealToOrder,
    removeLine,
    updateLineQty,
    updateLineDiscount,
    doCheckout,
  } = useOrders()

  const searchRef = useRef(null)
  const [category, setCategory] = useState(ALL_KEY)
  const [search, setSearch] = useState('')
  const [expandedLine, setExpandedLine] = useState(null)
  const [discountDraft, setDiscountDraft] = useState('')
  // Phones have no room for the ticket beside the menu, so it becomes a sheet
  // opened from the bar along the bottom.
  const [ticketOpen, setTicketOpen] = useState(false)
  // The tile that was just pressed, for a moment, so a tap visibly lands.
  const [flash, setFlash] = useState(null)

  const deals = useMemo(() => (menu.deals ?? []).filter((d) => d.status !== 'archived'), [menu.deals])

  // There is no "New order" gate on this screen: a till that is open is a
  // till taking an order. Held off while an invoice is opening, or the cart
  // that was just sold would be replaced by an empty one on the way out.
  useEffect(() => {
    if (!loading && !activeOrder && !openingInvoiceId) startNewOrder()
  }, [loading, activeOrder, openingInvoiceId, startNewOrder])

  useEffect(() => {
    setExpandedLine(null)
    setTicketOpen(false)
  }, [activeOrderId])

  // "/" jumps to search from anywhere that is not already a text box.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return
      const t = e.target
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Categories are grouped by the name the café sees, not by key. Menus carry
  // spelling variants — `snack` and `snacks`, `drink` and `drinks` — that the
  // categories table labels identically, and keyed one-per-button they put two
  // "Snacks" on the rail, each holding half the snacks.
  const groupOf = useMemo(() => {
    const m = new Map()
    for (const t of categoryTabs) m.set(t.key, t.label.trim().toLowerCase())
    return (key) => m.get(key || 'other') ?? categoryLabel(key || 'other', menu.categories).trim().toLowerCase()
  }, [categoryTabs, menu.categories])

  const rail = useMemo(() => {
    const counts = new Map()
    for (const i of menu.items) {
      const g = groupOf(i.category)
      counts.set(g, (counts.get(g) ?? 0) + 1)
    }
    const groups = []
    const seen = new Set()
    for (const t of categoryTabs) {
      const g = groupOf(t.key)
      if (seen.has(g) || !counts.get(g)) continue
      seen.add(g)
      groups.push({ key: g, label: t.label, icon: categoryIcon(t.key, menu.categories), count: counts.get(g) })
    }
    return [
      { key: ALL_KEY, label: 'All', icon: '🍴', count: menu.items.length },
      ...(deals.length ? [{ key: DEALS_KEY, label: 'Deals', icon: '🔥', count: deals.length }] : []),
      ...groups,
    ]
  }, [menu.items, menu.categories, categoryTabs, deals.length, groupOf])

  // A category the menu no longer has falls back to All rather than an empty wall.
  useEffect(() => {
    if (!rail.some((r) => r.key === category)) setCategory(ALL_KEY)
  }, [rail, category])

  const query = search.trim().toLowerCase()

  const tiles = useMemo(() => {
    const dealTiles = deals.map((d) => ({
      kind: 'deal',
      id: d.id,
      name: d.name,
      sub: `${d.includes?.length ?? 0} item${d.includes?.length === 1 ? '' : 's'} bundle`,
      price: d.price,
      icon: '🔥',
      color: null,
    }))
    const itemTiles = [...menu.items]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((i) => ({
        kind: 'item',
        id: i.id,
        name: i.name,
        sub: formatItemExtras(i),
        price: i.price,
        group: groupOf(i.category),
        icon: categoryIcon(i.category, menu.categories),
        color: categoryColor(i.category, menu.categories),
      }))
    // A search looks across the whole menu, deals included — whoever is typing
    // a name does not want to have picked the right category first.
    // Each word has to match. A number also matches by price, from the front —
    // "45" finds 450 and 455 while it is being typed, "450" narrows to 450 —
    // so "zinger 450" finds the Zinger at that price. A number can still match
    // the name too, for items like "7up" or "1.5L".
    if (query) {
      const words = query.split(/\s+/).filter(Boolean)
      return [...dealTiles, ...itemTiles].filter((t) => {
        const text = `${t.name} ${t.sub ?? ''}`.toLowerCase()
        const price = String(Number(t.price))
        return words.every((w) => {
          if (text.includes(w)) return true
          const n = w.replace(/,/g, '')
          return /^\d+(\.\d*)?$/.test(n) && price.startsWith(n)
        })
      })
    }
    if (category === DEALS_KEY) return dealTiles
    if (category === ALL_KEY) return [...dealTiles, ...itemTiles]
    return itemTiles.filter((t) => t.group === category)
  }, [deals, menu.items, menu.categories, category, query, groupOf])

  const lines = activeOrder?.lines ?? []

  const qtyOnTicket = useMemo(() => {
    const m = new Map()
    for (const l of lines) m.set(`${l.kind}:${l.refId}`, (m.get(`${l.kind}:${l.refId}`) ?? 0) + l.qty)
    return m
  }, [lines])

  const itemCount = lines.reduce((s, l) => s + l.qty, 0)

  function tap(tile) {
    if (!activeOrder) return
    setFlash(`${tile.kind}:${tile.id}`)
    setTimeout(() => setFlash((f) => (f === `${tile.kind}:${tile.id}` ? null : f)), 220)
    const existing = lines.find((l) => l.kind === tile.kind && l.refId === tile.id)
    if (existing) {
      updateLineQty(existing.id, existing.qty + 1)
    } else if (tile.kind === 'deal') {
      addDealToOrder(tile.id)
    } else {
      void addItemToOrder(tile.id, 1)
    }
  }

  function step(line, by) {
    const next = line.qty + by
    if (next < 1) {
      removeLine(line.id)
      if (expandedLine === line.id) setExpandedLine(null)
    } else {
      updateLineQty(line.id, next)
    }
  }

  function toggleLine(line) {
    if (expandedLine === line.id) {
      setExpandedLine(null)
      return
    }
    setExpandedLine(line.id)
    const { lineDiscount } = discountPartsOf(line)
    setDiscountDraft(lineDiscount ? String(lineDiscount) : '')
  }

  function commitDiscount(line) {
    const d = discountDraft === '' ? 0 : Number(discountDraft)
    if (!Number.isFinite(d) || d < 0) return
    if (d === discountPartsOf(line).lineDiscount) return
    try { updateLineDiscount(line.id, 'lineDiscount', d) } catch { /* error is on the context */ }
  }

  function clearTicket() {
    for (const l of lines) removeLine(l.id)
    setExpandedLine(null)
  }

  if (openingInvoiceId) {
    return (
      <main className="qo qo--handoff">
        <section className="card order-card order-handoff">
          <SkeletonStatus label="Opening invoice…" />
          <div className="order-handoff-spinner" aria-hidden="true" />
          <h2>Invoice created</h2>
          <p className="muted">Opening invoice {openingInvoiceId}…</p>
        </section>
      </main>
    )
  }

  const showBreakdown = (orderType === 'delivery' && Number(deliveryCharge) > 0) || orderTax.taxTotal > 0
  const total = showBreakdown ? orderGrandTotal : orderTotal
  const typeMeta = ORDER_TYPES.find((t) => t.value === orderType)

  return (
    <main className="qo">
      <OfflineBanner />

      <header className="qo-top">
        <div className="qo-top-title">
          <h2>Quick order</h2>
          <Link href="/orders" className="qo-switch">Classic view →</Link>
        </div>
        <label className="qo-search">
          <span aria-hidden="true">🔍</span>
          <input
            ref={searchRef}
            type="search"
            placeholder="Search name or price  ( / )"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds the first match, so a cashier who knows the menu
              // can ring up by typing alone.
              if (e.key === 'Enter' && query && tiles[0]) {
                e.preventDefault()
                tap(tiles[0])
                setSearch('')
              } else if (e.key === 'Escape') {
                setSearch('')
              }
            }}
            aria-label="Search menu"
          />
        </label>
      </header>

      {error ? <p className="banner error qo-error" role="alert">{error}</p> : null}

      <div className="qo-body">
        <nav className="qo-rail" aria-label="Categories">
          {rail.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`qo-rail-btn${!query && category === r.key ? ' is-active' : ''}${r.key === DEALS_KEY ? ' is-deals' : ''}`}
              onClick={() => { setCategory(r.key); setSearch('') }}
              aria-pressed={!query && category === r.key}
            >
              <span className="qo-rail-icon" aria-hidden="true">{r.icon}</span>
              <span className="qo-rail-label">{r.label}</span>
              <span className="qo-rail-count">{r.count}</span>
            </button>
          ))}
        </nav>

        <section className="qo-menu" aria-label="Menu">
          {loading ? (
            <div className="qo-empty"><SkeletonStatus label="Loading menu…" />Loading menu…</div>
          ) : tiles.length === 0 ? (
            <div className="qo-empty">
              {query ? <>Nothing on the menu matches “{search.trim()}”.</> : <>Nothing in this category yet.</>}
            </div>
          ) : (
            <ul className="qo-grid">
              {tiles.map((t) => {
                const key = `${t.kind}:${t.id}`
                const n = qtyOnTicket.get(key) ?? 0
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className={`qo-tile${t.kind === 'deal' ? ' qo-tile--deal' : ''}${n ? ' is-on' : ''}${flash === key ? ' is-flash' : ''}`}
                      style={t.color ? { '--tile-hue': t.color } : undefined}
                      onClick={() => tap(t)}
                      disabled={!activeOrder}
                      aria-label={`Add ${t.name}, ${money(t.price)}${n ? `, ${n} on order` : ''}`}
                    >
                      {t.kind === 'deal' ? <span className="qo-tile-ribbon">DEAL</span> : null}
                      {n ? <span className="qo-tile-qty">{n}</span> : null}
                      <span className="qo-tile-icon" aria-hidden="true">{t.icon}</span>
                      <span className="qo-tile-name">{t.name}</span>
                      {t.sub ? <span className="qo-tile-sub">{t.sub}</span> : null}
                      <span className="qo-tile-price">{money(t.price)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {ticketOpen ? <div className="qo-scrim" onClick={() => setTicketOpen(false)} aria-hidden="true" /> : null}

        <aside className={`qo-ticket${ticketOpen ? ' is-open' : ''}`} aria-label="Current order">
          <div className="qo-ticket-head">
            <div>
              <div className="qo-ticket-title">Your order</div>
              <div className="qo-ticket-sub">
                {itemCount ? `${itemCount} item${itemCount === 1 ? '' : 's'}` : 'Tap the menu to add'}
              </div>
            </div>
            <div className="qo-ticket-head-actions">
              {lines.length ? (
                <button type="button" className="ghost danger sm" onClick={clearTicket}>Clear</button>
              ) : null}
              <button type="button" className="ghost sm qo-ticket-close" onClick={() => setTicketOpen(false)} aria-label="Close order">✕</button>
            </div>
          </div>

          <div className="qo-types" role="radiogroup" aria-label="Order type">
            {ORDER_TYPES.map(({ value, label, icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={orderType === value}
                className={`qo-type${orderType === value ? ' is-active' : ''}`}
                onClick={() => setOrderType(value)}
              >
                <span aria-hidden="true">{icon}</span> {label}
              </button>
            ))}
          </div>

          <ol className="qo-lines">
            {lines.length === 0 ? (
              <li className="qo-lines-empty">
                <span aria-hidden="true">🧾</span>
                Nothing on the ticket yet.
              </li>
            ) : lines.map((line) => {
              const extras = line.kind === 'item' ? formatItemExtras(line) : ''
              const open = expandedLine === line.id
              const { unitDiscount } = discountPartsOf(line)
              return (
                <li key={line.id} className={`qo-line${open ? ' is-open' : ''}`}>
                  <div className="qo-line-main">
                    <div className="qo-stepper">
                      <button type="button" onClick={() => step(line, -1)} aria-label={line.qty === 1 ? `Remove ${line.name}` : `One less ${line.name}`}>
                        {line.qty === 1 ? '🗑' : '−'}
                      </button>
                      <span className="qo-stepper-n" aria-label="Quantity">{line.qty}</span>
                      <button type="button" onClick={() => step(line, 1)} aria-label={`One more ${line.name}`}>+</button>
                    </div>
                    <button type="button" className="qo-line-name" onClick={() => toggleLine(line)} aria-expanded={open}>
                      <span>
                        {line.kind === 'deal' ? <span className="qo-line-tag">Deal</span> : null}
                        {line.name}
                      </span>
                      {extras ? <span className="qo-line-extras">{extras}</span> : null}
                      <span className="qo-line-each">{money(line.unitPrice)} each</span>
                    </button>
                    <div className="qo-line-total">
                      {money(line.lineTotal)}
                      {(line.discount ?? 0) > 0 ? <span className="qo-line-off">−{money(line.discount)}</span> : null}
                    </div>
                  </div>
                  {open ? (
                    <div className="qo-line-edit">
                      {unitDiscount > 0 ? (
                        <p className="muted small">Discount of {money(unitDiscount)} per item, set on the classic screen.</p>
                      ) : (
                        <label className="qo-line-discount">
                          <span>Discount on this row</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="decimal"
                            placeholder="0"
                            value={discountDraft}
                            onChange={(e) => setDiscountDraft(e.target.value)}
                            onBlur={() => commitDiscount(line)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); commitDiscount(line); setExpandedLine(null) }
                            }}
                            autoFocus
                          />
                        </label>
                      )}
                      <button type="button" className="ghost danger sm" onClick={() => { removeLine(line.id); setExpandedLine(null) }}>
                        Remove
                      </button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>

          <div className="qo-extras">
            {orderType !== 'delivery' ? (
              <label className="qo-field">
                <span>🪑 Table</span>
                <input
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Optional"
                  maxLength={MAX_TABLE_NUMBER}
                  autoComplete="off"
                />
              </label>
            ) : (
              <label className="qo-field">
                <span>🛵 Delivery</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="decimal"
                  placeholder="0"
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(e.target.value)}
                />
              </label>
            )}
            <label className="qo-field">
              <span>📝 Note</span>
              <input
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="Allergy, pickup time…"
                maxLength={200}
              />
            </label>
          </div>

          <div className="qo-totals">
            {showBreakdown ? (
              <>
                <div className="qo-total-row">
                  <span>Subtotal</span>
                  {/* Inclusive pricing: line totals already hold the tax, so
                      the net is shown — the same rule as the classic screen. */}
                  <span>{money(orderTax.inclusive ? Math.round((orderTotal - orderTax.taxTotal) * 100) / 100 : orderTotal)}</span>
                </div>
                {orderType === 'delivery' && Number(deliveryCharge) > 0 ? (
                  <div className="qo-total-row"><span>Delivery</span><span>{money(Number(deliveryCharge))}</span></div>
                ) : null}
                {orderTax.lines.map((t) => (
                  <div key={t.id} className="qo-total-row">
                    <span>{t.name} ({t.rate}%){orderTax.inclusive ? ' · incl.' : ''}</span>
                    <span>{money(t.amount)}</span>
                  </div>
                ))}
              </>
            ) : null}
            <div className="qo-total-row qo-total-grand">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>
          </div>

          <button
            type="button"
            className="qo-pay"
            disabled={!lines.length || checkingOut}
            onClick={() => void doCheckout()}
          >
            {checkingOut ? 'Creating invoice…' : (
              <>
                <span>Create invoice · {typeMeta?.icon} {typeMeta?.label}</span>
                <strong>{money(total)}</strong>
              </>
            )}
          </button>
        </aside>
      </div>

      {/* Phone only: the ticket's summary, docked, opening it as a sheet. */}
      <button
        type="button"
        className="qo-dock"
        onClick={() => setTicketOpen(true)}
        disabled={!lines.length}
      >
        <span className="qo-dock-count">{itemCount}</span>
        <span>View order</span>
        <strong>{money(total)}</strong>
      </button>
    </main>
  )
}
