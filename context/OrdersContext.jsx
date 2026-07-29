'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/api.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { buildCategoryTabs } from '@/utils/formatting.js'
import { applyPricing, discountPartsOf, priceLine, repriceLine } from '@/lib/pricing.js'

const OrdersContext = createContext(null)

// Orders live purely in frontend state while being built — nothing is saved
// to the database until "Create invoice" is pressed, which sends the whole
// cart to /api/checkout in one call. This avoids the old flow that wrote a
// DB row per order and per line, and that duplicated `lines` data into the
// invoices table anyway.

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(16).slice(2)
}

function newOrderId() {
  return `o-${randomId().slice(0, 8)}`
}

function newLineId() {
  return `l-${randomId().slice(0, 8)}`
}

function buildItemLine(item, qty, discounts = {}) {
  const priced = priceLine({ unitPrice: item.price, qty, ...discounts })
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
    priced,
  )
}

function buildDealLine(deal, qty, discounts = {}) {
  const priced = priceLine({ unitPrice: deal.price, qty, ...discounts })
  return applyPricing(
    {
      id: newLineId(),
      kind: 'deal',
      refId: deal.id,
      name: deal.name,
      unitPrice: deal.price,
      dealIncludes: deal.includes ? deal.includes.map((x) => ({ ...x })) : [],
    },
    priced,
  )
}

export function OrdersProvider({ children }) {
  const router = useRouter()
  const { authenticated } = useAuth()
  const [menu, setMenu] = useState({ items: [], deals: [] })
  const [orders, setOrders] = useState([])
  const [activeOrderId, setActiveOrderId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [customerNote, setCustomerNote] = useState('')
  const [orderType, setOrderType] = useState('dine_in')
  const [deliveryCharge, setDeliveryCharge] = useState('')
  const [checkingOut, setCheckingOut] = useState(false)

  const refreshAll = useCallback(async () => {
    setError('')
    try {
      const m = await api.getMenu()
      setMenu(m)
    } catch (e) {
      setError(e.message || 'Could not load data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authenticated) {
      void refreshAll()
    } else {
      setLoading(false)
    }
  }, [authenticated, refreshAll])

  const categoryTabs = useMemo(() => buildCategoryTabs(menu.items), [menu.items])

  const activeOrder = useMemo(
    () => orders.find((o) => o.id === activeOrderId) || null,
    [orders, activeOrderId],
  )

  const orderMenuItems = useMemo(() => {
    if (!activeOrderId) return []
    return menu.items
  }, [menu.items, activeOrderId])

  const orderDeals = useMemo(() => {
    if (!activeOrderId) return []
    return menu.deals.filter((d) => d.status !== 'archived')
  }, [menu.deals, activeOrderId])

  const orderCategoryTabs = useMemo(() => buildCategoryTabs(orderMenuItems), [orderMenuItems])

  const orderTotal = useMemo(() => {
    if (!activeOrder?.lines?.length) return 0
    return Math.round(activeOrder.lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100
  }, [activeOrder])

  function updateActiveOrderLines(updater) {
    setOrders((prev) => prev.map((o) => (o.id === activeOrderId ? { ...o, lines: updater(o.lines) } : o)))
  }

  function startNewOrder() {
    setError('')
    const order = { id: newOrderId(), status: 'open', createdAt: new Date().toISOString(), lines: [] }
    setOrders((prev) => [...prev, order])
    setActiveOrderId(order.id)
    setCustomerNote('')
    setOrderType('dine_in')
    setDeliveryCharge('')
  }

  async function addItemToOrder(itemId, qty = 1, discounts = {}) {
    if (!activeOrderId) {
      setError('Start a new order first.')
      return false
    }
    const quantity = Number(qty)
    if (!Number.isFinite(quantity) || quantity < 1) {
      setError('Quantity must be at least 1.')
      return false
    }
    const item = menu.items.find((i) => i.id === itemId)
    if (!item) {
      setError('Menu item not found.')
      return false
    }
    setError('')
    updateActiveOrderLines((lines) => [...lines, buildItemLine(item, quantity, discounts)])
    return true
  }

  async function createMenuItemAndAddLine({ name, category, price, qty, discounts = {} }) {
    if (!activeOrderId) {
      setError('Start a new order first.')
      return false
    }
    const quantity = Number(qty)
    const p = Number(price)
    if (!Number.isFinite(quantity) || quantity < 1) {
      setError('Quantity must be at least 1.')
      return false
    }
    if (!Number.isFinite(p) || p <= 0) {
      setError('Enter a valid unit price for the new item.')
      return false
    }
    const trimmed = String(name).trim()
    if (!trimmed) {
      setError('Enter an item name.')
      return false
    }
    setError('')
    try {
      const exact = menu.items.find((i) => i.name.trim().toLowerCase() === trimmed.toLowerCase())
      let item = exact
      if (!item) {
        item = await api.createMenuItem({
          name: trimmed,
          category: category || 'other',
          price: p,
          // businessType inferred from category on the server
        })
        setMenu((prev) => ({ ...prev, items: [...prev.items, item] }))
      }
      updateActiveOrderLines((lines) => [...lines, buildItemLine(item, quantity, discounts)])
      return true
    } catch (e) {
      setError(e.message)
      return false
    }
  }

  function addDealToOrder(dealId) {
    if (!activeOrderId) {
      setError('Start a new order first.')
      return
    }
    const deal = menu.deals.find((d) => d.id === dealId)
    if (!deal) {
      setError('Deal not found.')
      return
    }
    setError('')
    updateActiveOrderLines((lines) => [...lines, buildDealLine(deal, 1)])
  }

  function removeLine(lineId) {
    if (!activeOrderId) return
    setError('')
    updateActiveOrderLines((lines) => lines.filter((l) => l.id !== lineId))
  }

  function updateLineQty(lineId, qty) {
    if (!activeOrderId) return
    const quantity = Number(qty)
    if (!Number.isFinite(quantity) || quantity < 1) {
      const err = new Error('qty must be a number ≥ 1')
      setError(err.message)
      throw err
    }
    const q = Math.floor(quantity)
    setError('')
    // A per-unit discount scales with qty, so the row has to be re-priced
    // rather than just having its total adjusted.
    updateActiveOrderLines((lines) => lines.map((l) => (l.id === lineId ? repriceLine(l, { qty: q }) : l)))
  }

  /** `field` is 'unitDiscount' (per item) or 'lineDiscount' (whole row). */
  function updateLineDiscount(lineId, field, value) {
    if (!activeOrderId) return
    const d = Number(value)
    if (!Number.isFinite(d) || d < 0) {
      const err = new Error('discount must be a number ≥ 0')
      setError(err.message)
      throw err
    }
    setError('')
    updateActiveOrderLines((lines) => lines.map((l) => (l.id === lineId ? repriceLine(l, { [field]: d }) : l)))
  }

  async function doCheckout() {
    if (!activeOrderId || !activeOrder || checkingOut) return
    setError('')
    setCheckingOut(true)
    try {
      const dc = orderType === 'delivery' ? (Number(deliveryCharge) || 0) : 0
      const lines = activeOrder.lines.map((l) => ({
        kind: l.kind,
        refId: l.refId,
        qty: l.qty,
        ...discountPartsOf(l),
      }))
      const { invoice } = await api.checkout({
        lines,
        customerNote,
        paymentMethod: null,
        orderType,
        deliveryCharge: dc,
      })
      setOrders((prev) => prev.filter((o) => o.id !== activeOrderId))
      setActiveOrderId(null)
      setCustomerNote('')
      setOrderType('dine_in')
      setDeliveryCharge('')
      router.push(`/invoices/${invoice.id}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setCheckingOut(false)
    }
  }

  const value = useMemo(() => ({
    menu,
    orders,
    activeOrderId,
    setActiveOrderId,
    activeOrder,
    orderMenuItems,
    orderDeals,
    orderCategoryTabs,
    orderTotal,
    categoryTabs,
    customerNote,
    setCustomerNote,
    orderType,
    setOrderType,
    deliveryCharge,
    setDeliveryCharge,
    error,
    setError,
    loading,
    checkingOut,
    refreshAll,
    startNewOrder,
    addItemToOrder,
    createMenuItemAndAddLine,
    addDealToOrder,
    removeLine,
    updateLineQty,
    updateLineDiscount,
    doCheckout,
  }), [
    menu, orders, activeOrderId, activeOrder,
    orderMenuItems, orderDeals, orderCategoryTabs, orderTotal,
    categoryTabs, customerNote, orderType, deliveryCharge, error, loading, checkingOut, refreshAll,
  ])

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
}

export function useOrders() {
  const ctx = useContext(OrdersContext)
  if (!ctx) throw new Error('useOrders must be used within OrdersProvider')
  return ctx
}
