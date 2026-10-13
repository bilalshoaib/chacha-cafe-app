'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useMoney } from '@/context/BrandingContext.jsx'
import { SkeletonStatus } from '@/components/Skeleton.jsx'
import { PARTNER_ORDER_TYPE, PartnerSaleDone, usePartnerTill } from '@/components/PartnerTill.jsx'
import { categoryColor, categoryIcon, categoryLabel, formatItemExtras } from '@/utils/formatting.js'
import { discountPartsOf, roundMoney } from '@/lib/pricing.js'

/**
 * A partner kitchen's till as tiles — the partner's version of /orders/quick.
 *
 * It shows only what the partner sells, at the partner's prices, and checks
 * out with the partner named; the server prices every line again from the
 * partner's list and files the sale under it. Shares its cart with the classic
 * view at /partners/[id] (components/PartnerTill.jsx).
 *
 * Online only. The café's till sells offline from a cached menu and a block of
 * reserved numbers; this one asks the server, and says so when it cannot.
 */

const ALL_KEY = '__all'

export default function PartnerQuickTillPage() {
  const money = useMoney()
  const till = usePartnerTill()
  const {
    partnerId, data, partnerName, loadError, reload, items, error, lines,
    bumpItem, setLineQty, setLineDiscount, removeLine, clearOrder,
    deliveryCharge, setDeliveryCharge,
    customerNote, setCustomerNote, subtotal, tax, dc, total, itemCount, checkout, checkingOut, sold,
  } = till

  const searchRef = useRef(null)
  const [category, setCategory] = useState(ALL_KEY)
  const [search, setSearch] = useState('')
  const [ticketOpen, setTicketOpen] = useState(false)
  const [expandedLine, setExpandedLine] = useState(null)
  const [discountDraft, setDiscountDraft] = useState('')
  const [flash, setFlash] = useState(null)

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

  const rail = useMemo(() => {
    const counts = new Map()
    for (const i of items) counts.set(i.category, (counts.get(i.category) ?? 0) + 1)
    return [
      { key: ALL_KEY, label: 'All', icon: '🍴', count: items.length },
      ...[...counts.entries()].map(([key, count]) => ({
        key,
        label: categoryLabel(key, data?.categories),
        icon: categoryIcon(key, data?.categories),
        count,
      })),
    ]
  }, [items, data])

  useEffect(() => {
    if (!rail.some((r) => r.key === category)) setCategory(ALL_KEY)
  }, [rail, category])

  const query = search.trim().toLowerCase()
  const tiles = useMemo(() => {
    if (query) {
      const words = query.split(/\s+/).filter(Boolean)
      return items.filter((i) => {
        const text = `${i.name} ${formatItemExtras(i)}`.toLowerCase()
        const price = String(Number(i.price))
        return words.every((w) => text.includes(w) || (/^\d+(\.\d*)?$/.test(w) && price.startsWith(w)))
      })
    }
    return category === ALL_KEY ? items : items.filter((i) => i.category === category)
  }, [items, category, query])

  const qtyOnTicket = useMemo(() => {
    const m = new Map()
    for (const l of lines) m.set(l.refId, (m.get(l.refId) ?? 0) + l.qty)
    return m
  }, [lines])

  function tap(item) {
    setFlash(item.id)
    setTimeout(() => setFlash((f) => (f === item.id ? null : f)), 220)
    bumpItem(item)
  }

  function toggleLine(line) {
    if (expandedLine === line.id) { setExpandedLine(null); return }
    setExpandedLine(line.id)
    const { lineDiscount } = discountPartsOf(line)
    setDiscountDraft(lineDiscount ? String(lineDiscount) : '')
  }

  function commitDiscount(line) {
    const d = discountDraft === '' ? 0 : Number(discountDraft)
    if (!Number.isFinite(d) || d < 0) return
    if (d === discountPartsOf(line).lineDiscount) return
    setLineDiscount(line.id, 'lineDiscount', d)
  }

  if (sold) return <PartnerSaleDone />

  if (loadError) {
    return (
      <main className="qo qo--handoff">
        <section className="card order-card">
          <p className="banner error" role="alert">{loadError}</p>
          <button type="button" className="ghost sm" onClick={() => void reload()}>Try again</button>
        </section>
      </main>
    )
  }

  const showBreakdown = dc > 0 || tax.taxTotal > 0
  const typeMeta = PARTNER_ORDER_TYPE

  return (
    <main className="qo">
      <header className="qo-top">
        <div className="qo-top-title">
          <h2>{partnerName} · Quick order</h2>
          <Link href={`/partners/${partnerId}`} className="qo-switch">Classic view →</Link>
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
            aria-label={`Search ${partnerName} menu`}
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
              className={`qo-rail-btn${!query && category === r.key ? ' is-active' : ''}`}
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
          {!data ? (
            <div className="qo-empty"><SkeletonStatus label="Loading menu…" />Loading menu…</div>
          ) : items.length === 0 ? (
            <div className="qo-empty">
              {partnerName} has nothing on its menu yet.{' '}
              <Link href={`/partners/${partnerId}/prices`}>Choose items and prices</Link>.
            </div>
          ) : tiles.length === 0 ? (
            <div className="qo-empty">
              {query ? <>Nothing on the menu matches “{search.trim()}”.</> : <>Nothing in this category yet.</>}
            </div>
          ) : (
            <ul className="qo-grid">
              {tiles.map((t) => {
                const n = qtyOnTicket.get(t.id) ?? 0
                const color = categoryColor(t.category, data.categories)
                const extras = formatItemExtras(t)
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`qo-tile${n ? ' is-on' : ''}${flash === t.id ? ' is-flash' : ''}`}
                      style={color ? { '--tile-hue': color } : undefined}
                      onClick={() => tap(t)}
                      aria-label={`Add ${t.name}, ${money(t.price)}${n ? `, ${n} on order` : ''}`}
                    >
                      {n ? <span className="qo-tile-qty">{n}</span> : null}
                      <span className="qo-tile-icon" aria-hidden="true">{categoryIcon(t.category, data.categories)}</span>
                      <span className="qo-tile-name">{t.name}</span>
                      {extras ? <span className="qo-tile-sub">{extras}</span> : null}
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
              <div className="qo-ticket-title">{partnerName} order</div>
              <div className="qo-ticket-sub">
                {itemCount ? `${itemCount} item${itemCount === 1 ? '' : 's'}` : 'Tap the menu to add'}
              </div>
            </div>
            <div className="qo-ticket-head-actions">
              {lines.length ? <button type="button" className="ghost danger sm" onClick={() => { clearOrder(); setExpandedLine(null) }}>Clear</button> : null}
              <button type="button" className="ghost sm qo-ticket-close" onClick={() => setTicketOpen(false)} aria-label="Close order">✕</button>
            </div>
          </div>

          <div className="qo-types qo-types--fixed">
            <span className="qo-type is-active"><span aria-hidden="true">{typeMeta.icon}</span> {typeMeta.label}</span>
          </div>

          <ol className="qo-lines">
            {lines.length === 0 ? (
              <li className="qo-lines-empty"><span aria-hidden="true">🧾</span>Nothing on the ticket yet.</li>
            ) : lines.map((line) => {
              const extras = formatItemExtras(line)
              const open = expandedLine === line.id
              const { unitDiscount } = discountPartsOf(line)
              return (
                <li key={line.id} className={`qo-line${open ? ' is-open' : ''}`}>
                  <div className="qo-line-main">
                    <div className="qo-stepper">
                      <button type="button" onClick={() => setLineQty(line.id, line.qty - 1)} aria-label={line.qty === 1 ? `Remove ${line.name}` : `One less ${line.name}`}>
                        {line.qty === 1 ? '🗑' : '−'}
                      </button>
                      <span className="qo-stepper-n" aria-label="Quantity">{line.qty}</span>
                      <button type="button" onClick={() => setLineQty(line.id, line.qty + 1)} aria-label={`One more ${line.name}`}>+</button>
                    </div>
                    <button type="button" className="qo-line-name" onClick={() => toggleLine(line)} aria-expanded={open}>
                      <span>{line.name}</span>
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
            <label className="qo-field">
              <span>🛵 Delivery</span>
              <input type="number" min={0} step={1} inputMode="decimal" placeholder="0" value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} />
            </label>
            <label className="qo-field">
              <span>📝 Note</span>
              <input value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} placeholder="Allergy, pickup time…" maxLength={200} />
            </label>
          </div>

          <div className="qo-totals">
            {showBreakdown ? (
              <>
                <div className="qo-total-row">
                  <span>Subtotal</span>
                  <span>{money(tax.inclusive ? roundMoney(subtotal - tax.taxTotal) : subtotal)}</span>
                </div>
                {dc > 0 ? <div className="qo-total-row"><span>Delivery</span><span>{money(dc)}</span></div> : null}
                {tax.lines.map((t) => (
                  <div key={t.id} className="qo-total-row">
                    <span>{t.name} ({t.rate}%){tax.inclusive ? ' · incl.' : ''}</span>
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

          <button type="button" className="qo-pay" disabled={!lines.length || checkingOut} onClick={() => void checkout()}>
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
      <button type="button" className="qo-dock" onClick={() => setTicketOpen(true)} disabled={!lines.length}>
        <span className="qo-dock-count">{itemCount}</span>
        <span>View order</span>
        <strong>{money(total)}</strong>
      </button>
    </main>
  )
}
