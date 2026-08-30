'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { api, isOfflineError } from '@/api.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { buildCategoryTabs } from '@/utils/formatting.js'
import { applyPricing, discountPartsOf, priceLine, repriceLine } from '@/lib/pricing.js'
import { computeInvoiceTax, invoiceTotal } from '@/lib/tax.js'
import { buildOfflineInvoice } from '@/lib/offlineSale.js'
import {
  cacheMenu,
  dropFromQueue,
  enqueueSale,
  listQueue,
  numbersRemaining,
  queueLength,
  readCachedMenu,
  readReservation,
  saveReservation,
  takeNumber,
} from '@/lib/offline/store.js'

// How many numbers a till holds, and the point at which it asks for more. The
// gap between them is the margin: the till tops up while it is still healthy,
// so it is never asking for numbers at the moment it stops being able to.
const BLOCK_SIZE = 50
const LOW_WATER = 15

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
  const pathname = usePathname()
  const { authenticated, user } = useAuth()
  const [menu, setMenu] = useState({ items: [], deals: [], categories: [], brands: [], tax: { pricesIncludeTax: true, rates: [] } })
  const [orders, setOrders] = useState([])
  const [activeOrderId, setActiveOrderId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [customerNote, setCustomerNote] = useState('')
  const [orderType, setOrderType] = useState('dine_in')
  const [deliveryCharge, setDeliveryCharge] = useState('')
  const [checkingOut, setCheckingOut] = useState(false)
  // Set the moment checkout succeeds and held until the invoice page is on
  // screen. Without it the order screen would briefly re-render its empty
  // "start a new order" state — the cart having just been cleared — before
  // the router got round to the invoice, which read as a stray flash.
  const [openingInvoiceId, setOpeningInvoiceId] = useState(null)
  // Whether the last thing the till tried actually reached the server. Not
  // navigator.onLine, which reports the network adapter and cheerfully says
  // true on a café wifi that has stopped routing anywhere — the state that
  // matters is "can I reach the server", and only a request can answer it.
  // navigator.onLine still feeds in below, because it is the fastest *negative*
  // signal there is.
  const [online, setOnline] = useState(true)
  const [queuedCount, setQueuedCount] = useState(0)
  const [numbersLeft, setNumbersLeft] = useState(0)
  const [menuCachedAt, setMenuCachedAt] = useState(null)
  const [syncing, setSyncing] = useState(false)
  // Tabs held on the server rather than in this browser, so a second device
  // can pick one up. `tabSaving` is separate from `checkingOut` because saving
  // to a tab is not a sale and must not disable the checkout button.
  const [tabs, setTabs] = useState([])
  const [tabSaving, setTabSaving] = useState(false)

  // The provider outlives the navigation, so the flag has to be dropped once
  // the invoice route has actually taken over. The timeout is the backstop for
  // a push that never lands — better to fall back to the order screen than to
  // leave the till spinning.
  useEffect(() => {
    if (!openingInvoiceId) return undefined
    if (pathname !== '/orders') {
      setOpeningInvoiceId(null)
      return undefined
    }
    const t = setTimeout(() => setOpeningInvoiceId(null), 10000)
    return () => clearTimeout(t)
  }, [openingInvoiceId, pathname])

  // The platform owner signs in with no café of their own, and only acquires
  // one by opening a support session. Asking for a menu before then would get
  // a 401, which the client reads as a dead session and signs them straight
  // back out — so it does not ask.
  const tenantId = user?.effectiveTenantId ?? user?.tenantId ?? null
  const hasTenant = Boolean(tenantId)

  /** Re-reads the two counts the offline banner is built from. */
  const refreshOfflineCounts = useCallback(async (tid) => {
    if (!tid) return
    setQueuedCount(await queueLength(tid))
    setNumbersLeft(await numbersRemaining(tid))
  }, [])

  /**
   * Makes sure the till is holding enough numbers to keep selling if the
   * connection goes now.
   *
   * Tops up rather than replacing whenever the block still belongs to the
   * current shift, because numbers thrown away are numbers missing from the
   * café's invoice sequence — the reservation spends them at the database
   * whether the till uses them or not. Once the shift date has moved on the
   * old order numbers are worthless and the block is replaced.
   */
  const topUpNumbers = useCallback(async (tid) => {
    if (!tid) return
    try {
      const held = await readReservation(tid)
      const remaining = Array.isArray(held?.numbers) ? held.numbers.length : 0
      if (remaining >= LOW_WATER) {
        setNumbersLeft(remaining)
        return
      }
      const block = await api.reserveNumbers(BLOCK_SIZE)
      const sameShift = held?.shiftDate === block.shiftDate
      const numbers = sameShift ? [...held.numbers, ...block.numbers] : block.numbers
      await saveReservation(tid, {
        shiftDate: block.shiftDate,
        dayStartHour: block.dayStartHour,
        timezone: block.timezone,
        numbers,
      })
      setNumbersLeft(numbers.length)
    } catch (e) {
      // A till that cannot reserve is a till that cannot sell offline, but it
      // can still sell. Nothing is surfaced here; the banner already says
      // how many numbers are left, and that is the honest signal.
      if (!isOfflineError(e)) console.warn('[offline] could not reserve numbers:', e.message)
    }
  }, [])

  /**
   * Sends everything the till rang up while it was disconnected.
   *
   * Entries are dropped only on a definite answer. `stored` means the sale is
   * in the database — including the duplicate case, where a previous attempt
   * got through and the reply did not. `rejected` means it will never store
   * and keeping it would block the queue forever. Anything else stays, because
   * the alternative to retrying a sale is losing it.
   */
  const drainQueue = useCallback(async (tid) => {
    if (!tid) return
    const pending = await listQueue(tid)
    if (!pending.length) return
    setSyncing(true)
    try {
      const { results } = await api.syncOfflineSales(
        pending.map((row) => ({ ...row.invoice, localId: row.localId })),
      )
      const settled = (results || [])
        .filter((r) => r.status === 'stored' || r.status === 'rejected')
        .map((r) => r.localId)
      if (settled.length) await dropFromQueue(tid, settled)

      const refused = (results || []).filter((r) => r.status === 'rejected')
      if (refused.length) {
        setError(`${refused.length} offline sale${refused.length > 1 ? 's' : ''} could not be saved: ${refused[0].error}`)
      }
    } catch (e) {
      if (!isOfflineError(e)) console.warn('[offline] sync failed:', e.message)
    } finally {
      setSyncing(false)
      await refreshOfflineCounts(tid)
    }
  }, [refreshOfflineCounts])

  const refreshAll = useCallback(async () => {
    setError('')
    try {
      const m = await api.getMenu()
      setMenu(m)
      setOnline(true)
      setMenuCachedAt(null)
      // Deliberately not awaited as a group: the menu is on screen the moment
      // it arrives, and the housekeeping behind it must not hold up the till.
      void cacheMenu(tenantId, m)
      void drainQueue(tenantId).then(() => topUpNumbers(tenantId))
    } catch (e) {
      // Falling back to the last menu this till saw. A café with no cached
      // menu — a device being set up for the first time on a dead connection —
      // still gets the error, because there is genuinely nothing to sell from.
      if (isOfflineError(e)) {
        setOnline(false)
        const cached = await readCachedMenu(tenantId)
        if (cached?.menu) {
          setMenu(cached.menu)
          setMenuCachedAt(cached.cachedAt)
          await refreshOfflineCounts(tenantId)
        } else {
          setError('No connection, and this device has no saved menu to sell from.')
        }
      } else {
        setError(e.message || 'Could not load data.')
      }
    } finally {
      setLoading(false)
    }
  }, [tenantId, drainQueue, topUpNumbers, refreshOfflineCounts])

  useEffect(() => {
    if (authenticated && hasTenant) {
      void refreshAll()
    } else {
      setLoading(false)
    }
  }, [authenticated, hasTenant, refreshAll])

  /**
   * The browser's own view of the network, used only in the direction it is
   * reliable. `offline` firing means there is definitely no connection, so the
   * till switches over immediately rather than making a cashier wait for a
   * request to time out. `online` firing means only that an adapter came back,
   * which is not the same as the server being reachable — so it triggers a
   * refresh and lets the outcome of that decide.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const goOffline = () => setOnline(false)
    const goOnline = () => { if (authenticated && hasTenant) void refreshAll() }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [authenticated, hasTenant, refreshAll])

  /**
   * While there are sales waiting, the till keeps trying on its own.
   *
   * A café that comes back after an outage should not have to know that
   * anything needs doing — least of all mid-service. The interval only exists
   * when there is something queued, so a normally-connected till never runs it.
   */
  useEffect(() => {
    if (!hasTenant || !queuedCount) return undefined
    const t = setInterval(() => { void drainQueue(tenantId) }, 30000)
    return () => clearInterval(t)
  }, [hasTenant, tenantId, queuedCount, drainQueue])

  const categoryTabs = useMemo(() => buildCategoryTabs(menu.items, menu.categories), [menu.items, menu.categories])

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

  const orderCategoryTabs = useMemo(() => buildCategoryTabs(orderMenuItems, menu.categories), [orderMenuItems, menu.categories])

  const orderTotal = useMemo(() => {
    if (!activeOrder?.lines?.length) return 0
    return Math.round(activeOrder.lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100
  }, [activeOrder])

  /**
   * The tax on the cart as it stands, so the till can show what the customer
   * will owe before the sale is made rather than after.
   *
   * Computed by the same lib/tax.js the server runs at checkout, over rates
   * that arrived with the menu — so the figure on the screen is the figure on
   * the receipt, and neither costs a round trip. It is a preview and nothing
   * more: /api/checkout recomputes it and the invoice records what the server
   * decided, never what was sent.
   *
   * The order type is in the dependency list because a dine-in surcharge stops
   * applying the moment the cashier presses Takeaway, and the total on screen
   * has to follow.
   */
  const orderTax = useMemo(
    () => computeInvoiceTax({
      lines: activeOrder?.lines ?? [],
      rates: menu.tax?.rates ?? [],
      orderType,
      pricesIncludeTax: menu.tax?.pricesIncludeTax ?? true,
    }),
    [activeOrder, menu.tax, orderType],
  )

  /** Subtotal, delivery and tax as one figure, added up the one way. */
  const orderGrandTotal = useMemo(
    () => invoiceTotal({
      subtotal: orderTotal,
      deliveryCharge: orderType === 'delivery' ? (Number(deliveryCharge) || 0) : 0,
      taxTotal: orderTax.taxTotal,
      inclusive: orderTax.inclusive,
    }),
    [orderTotal, orderType, deliveryCharge, orderTax],
  )

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

  // ── Tabs ───────────────────────────────────────────────────────────────────
  //
  // A tab is a cart that lives on the server, so a second device can pick it
  // up. It is loaded into an ordinary local order to be worked on — every
  // existing operation on the cart then applies unchanged — and that order
  // carries the tab's id and the version it was read at, which is what the
  // server checks before accepting a save.

  const refreshTabs = useCallback(async () => {
    if (!hasTenant) return
    try {
      const { tabs: list } = await api.listTabs()
      setTabs(list ?? [])
    } catch (e) {
      // A till with no connection has no tabs, and says so through the offline
      // banner rather than by putting a second error on the screen.
      if (!isOfflineError(e)) setError(e.message)
    }
  }, [hasTenant])

  useEffect(() => { if (authenticated && hasTenant) void refreshTabs() }, [authenticated, hasTenant, refreshTabs])

  async function startTab(label) {
    const name = String(label ?? '').trim()
    if (!name) { setError('Give the tab a name — a table number will do.'); return null }
    setError('')
    try {
      const { tab } = await api.openTab({ label: name })
      setTabs((prev) => [tab, ...prev])
      loadTabIntoCart(tab)
      return tab
    } catch (e) {
      setError(isOfflineError(e) ? 'Tabs need a connection — this one is held on the server so another device can pick it up.' : e.message)
      return null
    }
  }

  /** Opens a tab as the active order, seeded with whatever is already on it. */
  function loadTabIntoCart(tab) {
    const order = {
      id: newOrderId(),
      status: 'open',
      createdAt: new Date().toISOString(),
      lines: Array.isArray(tab.lines) ? tab.lines : [],
      tabId: tab.id,
      tabLabel: tab.label,
      tabVersion: tab.version,
    }
    setOrders((prev) => [...prev, order])
    setActiveOrderId(order.id)
    setCustomerNote(tab.customerNote ?? '')
    setOrderType(tab.orderType ?? 'dine_in')
    setDeliveryCharge('')
  }

  async function openTabById(tabId) {
    setError('')
    // Re-read rather than trusting the list, which may be a minute old — the
    // whole point of a tab is that somebody else may have added to it since.
    try {
      const { tab } = await api.getTab(tabId)
      if (tab.status !== 'open') {
        setError(`That tab has already been ${tab.status === 'invoiced' ? 'rung up' : 'closed'}.`)
        await refreshTabs()
        return
      }
      loadTabIntoCart(tab)
    } catch (e) {
      setError(e.message)
    }
  }

  /**
   * Pushes what is in the cart back to the tab.
   *
   * A conflict is surfaced rather than resolved. The server hands back what
   * the tab actually says now, and the cashier is shown it — guessing which
   * of two people's rounds to keep is not a decision this code can make
   * correctly, and picking wrong loses somebody's drinks.
   */
  async function saveActiveTab() {
    if (!activeOrder?.tabId || tabSaving) return false
    setTabSaving(true)
    setError('')
    try {
      const { tab } = await api.updateTab(activeOrder.tabId, {
        version: activeOrder.tabVersion,
        lines: activeOrder.lines,
        orderType,
        customerNote,
      })
      setOrders((prev) => prev.map((o) => (o.id === activeOrderId ? { ...o, tabVersion: tab.version } : o)))
      setTabs((prev) => prev.map((t) => (t.id === tab.id ? tab : t)))
      return true
    } catch (e) {
      setError(e.message)
      await refreshTabs()
      return false
    } finally {
      setTabSaving(false)
    }
  }

  async function abandonTabById(tabId) {
    setError('')
    try {
      await api.abandonTab(tabId)
      setTabs((prev) => prev.filter((t) => t.id !== tabId))
      setOrders((prev) => prev.filter((o) => o.tabId !== tabId))
      setActiveOrderId((cur) => (orders.find((o) => o.id === cur)?.tabId === tabId ? null : cur))
    } catch (e) {
      setError(e.message)
      await refreshTabs()
    }
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

  /**
   * Rings the sale up on this device, out of the reserved block.
   *
   * Returns null if there is nothing left to number with, which is the one
   * case where an offline till genuinely has to stop: an invoice number is
   * the only part of a sale it cannot work out for itself, and inventing one
   * would collide with a number the server will hand to somebody else.
   */
  async function checkoutOffline(dc) {
    const reservation = await takeNumber(tenantId)
    if (!reservation) return null

    const invoice = buildOfflineInvoice({
      lines: activeOrder.lines,
      reservation,
      rates: menu.tax?.rates ?? [],
      pricesIncludeTax: menu.tax?.pricesIncludeTax ?? true,
      orderType,
      deliveryCharge: dc,
      customerNote,
      dayStartHour: reservation.dayStartHour,
      timezone: reservation.timezone,
    })
    await enqueueSale(tenantId, invoice)
    await refreshOfflineCounts(tenantId)
    return invoice
  }

  function clearSoldOrder(invoiceId) {
    setOpeningInvoiceId(invoiceId)
    setOrders((prev) => prev.filter((o) => o.id !== activeOrderId))
    setActiveOrderId(null)
    setCustomerNote('')
    setOrderType('dine_in')
    setDeliveryCharge('')
    router.push(`/invoices/${invoiceId}`)
  }

  async function doCheckout() {
    if (!activeOrderId || !activeOrder || checkingOut) return
    setError('')
    setCheckingOut(true)
    const dc = orderType === 'delivery' ? (Number(deliveryCharge) || 0) : 0
    try {
      // Straight to the queue when the till already knows it is disconnected,
      // rather than making the cashier watch a request time out with a
      // customer waiting. Any other time it goes to the server first: the
      // server is the authority on price whenever it can be reached, and this
      // path stays the one that normally runs.
      if (!online) {
        const invoice = await checkoutOffline(dc)
        if (!invoice) {
          setError('No connection and no invoice numbers left on this device. Reconnect to keep selling.')
          return
        }
        clearSoldOrder(invoice.id)
        return
      }

      const lines = activeOrder.lines.map((l) => ({
        kind: l.kind,
        refId: l.refId,
        qty: l.qty,
        ...discountPartsOf(l),
      }))
      const { invoice, tabAlreadyClosed } = await api.checkout({
        lines,
        customerNote,
        paymentMethod: null,
        orderType,
        deliveryCharge: dc,
        // Closes the tab in the same request that creates the invoice, so a
        // sale and the tab it came from cannot end up disagreeing.
        ...(activeOrder.tabId ? { tabId: activeOrder.tabId } : {}),
      })
      if (activeOrder.tabId) {
        setTabs((prev) => prev.filter((t) => t.id !== activeOrder.tabId))
        // Another device rang it up first. The invoice is real and the
        // customer has paid, so the sale stands — but somebody should know
        // there are now two.
        if (tabAlreadyClosed) setError('That tab had already been rung up on another device — check for a duplicate sale.')
      }
      clearSoldOrder(invoice.id)
    } catch (e) {
      // The connection dropped between pressing the button and the server
      // answering. The sale is good — it was the network that failed — so it
      // is rung up locally instead of being handed back as an error.
      //
      // Safe against the sale having actually landed: the server's copy would
      // carry a different invoice number from the sequence, and this one takes
      // a number from the block, so the retry cannot overwrite it. A sale that
      // got through and lost its reply is the one case that can produce two
      // invoices, and a duplicate is recoverable in a way that a lost sale and
      // an unhappy customer at the counter is not.
      if (isOfflineError(e)) {
        setOnline(false)
        try {
          const invoice = await checkoutOffline(dc)
          if (invoice) {
            clearSoldOrder(invoice.id)
            return
          }
          setError('Lost the connection, and there are no invoice numbers left on this device.')
        } catch (offlineError) {
          setError(offlineError.message)
        }
      } else {
        setError(e.message)
      }
      setOpeningInvoiceId(null)
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
    orderTax,
    orderGrandTotal,
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
    openingInvoiceId,
    tabs,
    tabSaving,
    activeTab: activeOrder?.tabId
      ? { id: activeOrder.tabId, label: activeOrder.tabLabel, version: activeOrder.tabVersion }
      : null,
    refreshTabs,
    startTab,
    openTabById,
    saveActiveTab,
    abandonTabById,
    online,
    queuedCount,
    numbersLeft,
    menuCachedAt,
    syncing,
    syncNow: () => drainQueue(tenantId),
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
    orderMenuItems, orderDeals, orderCategoryTabs, orderTotal, orderTax, orderGrandTotal,
    categoryTabs, customerNote, orderType, deliveryCharge, error, loading, checkingOut, openingInvoiceId, refreshAll,
    online, queuedCount, numbersLeft, menuCachedAt, syncing, drainQueue, tenantId,
    tabs, tabSaving, refreshTabs,
  ])

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
}

export function useOrders() {
  const ctx = useContext(OrdersContext)
  if (!ctx) throw new Error('useOrders must be used within OrdersProvider')
  return ctx
}
