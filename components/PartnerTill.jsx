'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { api } from '@/api.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { useMoney } from '@/context/BrandingContext.jsx'
import { applyPricing, discountPartsOf, priceLine, repriceLine, roundMoney } from '@/lib/pricing.js'
import { computeInvoiceTax, invoiceTotal } from '@/lib/tax.js'

/**
 * The cart behind a partner kitchen's till (lib/partners.js), shared by its
 * two views — the classic entry-row screen and the quick tile screen — the way
 * OrdersContext is shared by the café's /orders and /orders/quick. An order
 * started on one view can be finished on the other.
 *
 * Its own state, not OrdersContext's: a partner's login has no OrdersContext,
 * and a café user's partner cart must never be the café's cart. Lives in
 * app/partners/[id]/layout.jsx, so it survives moving between the two views
 * and is dropped on leaving the partner altogether.
 *
 * Prices here are a preview. Checkout sends only item, qty and discounts; the
 * server prices every line again from the partner's list.
 */

const PartnerTillContext = createContext(null)

/**
 * A partner's sale is always a delivery — the server holds it to that too
 * (app/api/checkout/route.js) — so its till has no order type to choose.
 */
export const PARTNER_ORDER_TYPE = { value: 'delivery', label: 'Delivery', icon: '🛵' }

function newLineId() {
  const c = globalThis.crypto
  const id = typeof c?.randomUUID === 'function' ? c.randomUUID() : Math.random().toString(16).slice(2)
  return `l-${id.slice(0, 8)}`
}

function buildLine(item, qty, discounts = {}) {
  return applyPricing(
    {
      id: newLineId(),
      kind: 'item',
      refId: item.id,
      name: item.name,
      category: item.category,
      unitPrice: item.price,
      ...(item.size ? { size: item.size } : {}),
      ...(item.flavour ? { flavour: item.flavour } : {}),
    },
    priceLine({ unitPrice: item.price, qty, ...discounts }),
  )
}

export function PartnerTillProvider({ partnerId, children }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuth()
  const isPartnerLogin = user?.role === 'partner'

  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [lines, setLines] = useState([])
  const orderType = PARTNER_ORDER_TYPE.value
  const [deliveryCharge, setDeliveryCharge] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [checkingOut, setCheckingOut] = useState(false)
  // The sale just made, shown to a partner login in place of the café's
  // receipt screen, which it cannot open.
  const [sold, setSold] = useState(null)

  const reload = useCallback(async () => {
    setLoadError('')
    try {
      setData(await api.getPartner(partnerId))
    } catch (e) {
      setLoadError(e.message)
    }
  }, [partnerId])

  // Re-read on every move within the partner's pages, so a price saved on the
  // price list is the price the till shows when the cashier comes back to it.
  useEffect(() => { void reload() }, [reload, pathname])

  /** What the partner sells right now, each at the partner's price — the café's items and its own. */
  const items = useMemo(
    () => [
      ...(data?.items ?? []).filter((i) => i.price != null && i.visible),
      ...(data?.ownItems ?? []).filter((i) => i.visible).map((i) => ({ ...i, own: true })),
    ].sort((a, b) => a.name.localeCompare(b.name)),
    [data],
  )

  function addItem(item, qty = 1, discounts = {}) {
    const q = Math.floor(Number(qty))
    if (!Number.isFinite(q) || q < 1) return false
    setError('')
    setLines((prev) => [...prev, buildLine(item, q, discounts)])
    return true
  }

  /** One more of an item: bumps the row already holding it, or starts one. */
  function bumpItem(item) {
    setError('')
    setLines((prev) => {
      const at = prev.findIndex((l) => l.refId === item.id)
      if (at === -1) return [...prev, buildLine(item, 1)]
      const next = [...prev]
      next[at] = repriceLine(next[at], { qty: next[at].qty + 1 })
      return next
    })
  }

  /** Sets a row's quantity; below one removes it. */
  function setLineQty(lineId, qty) {
    const q = Math.floor(Number(qty))
    if (!Number.isFinite(q)) return
    setError('')
    setLines((prev) => (q < 1
      ? prev.filter((l) => l.id !== lineId)
      : prev.map((l) => (l.id === lineId ? repriceLine(l, { qty: q }) : l))))
  }

  /** `field` is 'unitDiscount' (per item) or 'lineDiscount' (whole row). */
  function setLineDiscount(lineId, field, value) {
    const d = Number(value)
    if (!Number.isFinite(d) || d < 0) return
    setError('')
    setLines((prev) => prev.map((l) => (l.id === lineId ? repriceLine(l, { [field]: d }) : l)))
  }

  function removeLine(lineId) {
    setLines((prev) => prev.filter((l) => l.id !== lineId))
  }

  function clearOrder() {
    setLines([])
    setCustomerNote('')
    setDeliveryCharge('')
    setError('')
  }

  const subtotal = roundMoney(lines.reduce((s, l) => s + l.lineTotal, 0))
  const tax = useMemo(() => computeInvoiceTax({
    lines,
    rates: data?.tax?.rates ?? [],
    orderType,
    pricesIncludeTax: data?.tax?.pricesIncludeTax ?? true,
  }), [lines, data, orderType])
  const dc = Number(deliveryCharge) || 0
  const total = invoiceTotal({ subtotal, deliveryCharge: dc, taxTotal: tax.taxTotal, inclusive: tax.inclusive })
  const itemCount = lines.reduce((s, l) => s + l.qty, 0)

  async function checkout() {
    if (!lines.length || checkingOut) return
    setError('')
    setCheckingOut(true)
    try {
      const { invoice } = await api.checkout({
        partnerId,
        lines: lines.map((l) => ({ kind: 'item', refId: l.refId, qty: l.qty, ...discountPartsOf(l) })),
        customerNote,
        paymentMethod: null,
        orderType,
        deliveryCharge: dc,
      })
      clearOrder()
      // The café's cashier gets the café's own receipt screen, which prints.
      if (!isPartnerLogin) {
        router.push(`/invoices/${invoice.id}`)
        return
      }
      setSold(invoice)
    } catch (e) {
      setError(e.offline ? 'No connection — this till needs one to ring up a sale.' : e.message)
    } finally {
      setCheckingOut(false)
    }
  }

  const value = {
    partnerId,
    data,
    partnerName: data?.partner?.name ?? 'Partner',
    loadError,
    reload,
    items,
    error,
    setError,
    lines,
    addItem,
    bumpItem,
    setLineQty,
    setLineDiscount,
    removeLine,
    clearOrder,
    orderType,
    deliveryCharge,
    setDeliveryCharge,
    customerNote,
    setCustomerNote,
    subtotal,
    tax,
    dc,
    total,
    itemCount,
    checkout,
    checkingOut,
    sold,
    setSold,
  }

  return <PartnerTillContext.Provider value={value}>{children}</PartnerTillContext.Provider>
}

export function usePartnerTill() {
  const ctx = useContext(PartnerTillContext)
  if (!ctx) throw new Error('usePartnerTill must be used within PartnerTillProvider')
  return ctx
}

/** Shown to a partner login after a sale, in place of the café's receipt. */
export function PartnerSaleDone() {
  const money = useMoney()
  const { sold, setSold } = usePartnerTill()
  if (!sold) return null
  return (
    <main className="qo qo--handoff">
      <section className="card order-card order-handoff">
        <h2>Sale recorded</h2>
        <p className="muted">
          Invoice {sold.id}{sold.shiftNumber != null ? ` · Order #${sold.shiftNumber}` : ''} · {money(sold.total)}
        </p>
        <button type="button" className="primary" onClick={() => setSold(null)}>New order</button>
      </section>
    </main>
  )
}
