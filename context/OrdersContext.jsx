'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/api.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { buildCategoryTabs } from '@/utils/formatting.js'
import { orderBusinessType } from '@/constants/businessTypes.js'

const OrdersContext = createContext(null)

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

  const refreshAll = useCallback(async () => {
    setError('')
    try {
      const [m, o] = await Promise.all([api.getMenu(), api.getOrders()])
      setMenu(m)
      setOrders(o)
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

  async function startNewOrder() {
    setError('')
    try {
      const o = await api.createOrder()
      setOrders((prev) => [...prev, o])
      setActiveOrderId(o.id)
      setCustomerNote('')
      setDeliveryCharge('')
    } catch (e) {
      setError(e.message)
    }
  }

  async function addItemToOrder(itemId, qty = 1, discount = 0) {
    if (!activeOrderId) {
      setError('Start a new order first.')
      return false
    }
    const quantity = Number(qty)
    if (!Number.isFinite(quantity) || quantity < 1) {
      setError('Quantity must be at least 1.')
      return false
    }
    setError('')
    try {
      const body = { kind: 'item', refId: itemId, qty: quantity }
      if (discount > 0) body.discount = discount
      const updated = await api.addLine(activeOrderId, body)
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
      return true
    } catch (e) {
      setError(e.message)
      return false
    }
  }

  async function createMenuItemAndAddLine({ name, category, price, qty, discount = 0 }) {
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
      let itemId
      if (exact) {
        itemId = exact.id
      } else {
        const created = await api.createMenuItem({
          name: trimmed,
          category: category || 'other',
          price: p,
          // businessType inferred from category on the server
        })
        itemId = created.id
        setMenu((prev) => ({ ...prev, items: [...prev.items, created] }))
      }
      const body = { kind: 'item', refId: itemId, qty: quantity }
      if (discount > 0) body.discount = discount
      const updated = await api.addLine(activeOrderId, body)
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
      return true
    } catch (e) {
      setError(e.message)
      return false
    }
  }

  async function addDealToOrder(dealId) {
    if (!activeOrderId) {
      setError('Start a new order first.')
      return
    }
    setError('')
    try {
      const updated = await api.addLine(activeOrderId, { kind: 'deal', refId: dealId, qty: 1 })
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    } catch (e) {
      setError(e.message)
    }
  }

  async function removeLine(lineId) {
    if (!activeOrderId) return
    setError('')
    try {
      const updated = await api.removeLine(activeOrderId, lineId)
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    } catch (e) {
      setError(e.message)
    }
  }

  async function updateLineQty(lineId, qty) {
    if (!activeOrderId) return
    setError('')
    try {
      const updated = await api.updateOrderLine(activeOrderId, lineId, { qty })
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    } catch (e) {
      setError(e.message)
      throw e
    }
  }

  async function updateLineDiscount(lineId, discount) {
    if (!activeOrderId) return
    setError('')
    try {
      const updated = await api.updateOrderLine(activeOrderId, lineId, { discount })
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    } catch (e) {
      setError(e.message)
      throw e
    }
  }

  async function doCheckout() {
    if (!activeOrderId) return
    setError('')
    try {
      const dc = orderType === 'delivery' ? (Number(deliveryCharge) || 0) : 0
      const { invoice, order } = await api.checkout(activeOrderId, customerNote, null, orderType, dc)
      setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)))
      router.push(`/invoices/${invoice.id}`)
      setActiveOrderId(null)
      setCustomerNote('')
      setOrderType('dine_in')
      setDeliveryCharge('')
    } catch (e) {
      setError(e.message)
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
    categoryTabs, customerNote, orderType, deliveryCharge, error, loading, refreshAll,
  ])

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
}

export function useOrders() {
  const ctx = useContext(OrdersContext)
  if (!ctx) throw new Error('useOrders must be used within OrdersProvider')
  return ctx
}
