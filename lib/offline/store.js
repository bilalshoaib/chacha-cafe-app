'use client'
/**
 * What the till keeps on the device so it can go on selling without a network.
 *
 * Three things live here: the menu and tax rates it last saw, the block of
 * invoice numbers it reserved to spend while disconnected, and the sales it
 * has rung up but not yet been able to send.
 *
 * IndexedDB rather than localStorage, for the queue specifically. Queued sales
 * are money that exists nowhere else until they sync — losing them to a quota
 * error on a busy day is the one failure this whole feature is supposed to
 * prevent, and localStorage has a small cap, no transactions, and blocks the
 * main thread while the cashier is trying to take an order.
 *
 * The database is named per tenant. Two cafés signed in on the same browser —
 * a demo laptop, a shared back-office machine — must not inherit each other's
 * menu, and must certainly not drain each other's queued sales into the wrong
 * café's books.
 */

const VERSION = 1
const META = 'meta'
const QUEUE = 'queue'

function dbName(tenantId) {
  return `cafe-pos-offline:${tenantId || 'unknown'}`
}

/** Resolves null anywhere IndexedDB is missing — SSR, or a locked-down browser. */
function openDb(tenantId) {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    let req
    try {
      req = indexedDB.open(dbName(tenantId), VERSION)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: 'localId' })
    }
    req.onsuccess = () => resolve(req.result)
    // Private windows, cleared site data and "block all cookies" all land here.
    // The till has to keep working online in all of them, so a dead store is
    // an absent one rather than a thrown error.
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
}

function run(db, storeName, mode, fn) {
  if (!db) return Promise.resolve(null)
  return new Promise((resolve) => {
    let tx
    try {
      tx = db.transaction(storeName, mode)
    } catch {
      resolve(null)
      return
    }
    const store = tx.objectStore(storeName)
    let result = null
    try {
      const req = fn(store)
      if (req) req.onsuccess = () => { result = req.result }
    } catch {
      resolve(null)
      return
    }
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => resolve(null)
    tx.onabort = () => resolve(null)
  })
}

async function withDb(tenantId, storeName, mode, fn) {
  const db = await openDb(tenantId)
  if (!db) return null
  try {
    return await run(db, storeName, mode, fn)
  } finally {
    db.close()
  }
}

// ── The menu, as the till last saw it ────────────────────────────────────────

export async function cacheMenu(tenantId, menu) {
  if (!menu) return
  await withDb(tenantId, META, 'readwrite', (s) =>
    s.put({ key: 'menu', menu, cachedAt: new Date().toISOString() }))
}

/** The cached menu and when it was taken, or null if this till has never been online. */
export async function readCachedMenu(tenantId) {
  const row = await withDb(tenantId, META, 'readonly', (s) => s.get('menu'))
  return row ? { menu: row.menu, cachedAt: row.cachedAt } : null
}

// ── The block of numbers reserved for offline sales ──────────────────────────

export async function saveReservation(tenantId, reservation) {
  await withDb(tenantId, META, 'readwrite', (s) => s.put({ key: 'reservation', ...reservation }))
}

export async function readReservation(tenantId) {
  return withDb(tenantId, META, 'readonly', (s) => s.get('reservation'))
}

/**
 * Spends one number out of the block.
 *
 * The read, the removal and the write are one transaction so that two tabs of
 * the same till — a cashier who opened the orders screen twice — cannot both
 * be handed the same invoice number.
 */
export async function takeNumber(tenantId) {
  const db = await openDb(tenantId)
  if (!db) return null
  try {
    return await new Promise((resolve) => {
      let tx
      try {
        tx = db.transaction(META, 'readwrite')
      } catch {
        resolve(null)
        return
      }
      const store = tx.objectStore(META)
      let taken = null
      const req = store.get('reservation')
      req.onsuccess = () => {
        const row = req.result
        if (!row || !Array.isArray(row.numbers) || !row.numbers.length) return
        const [next, ...rest] = row.numbers
        taken = { ...next, shiftDate: row.shiftDate, dayStartHour: row.dayStartHour, timezone: row.timezone }
        store.put({ ...row, numbers: rest })
      }
      tx.oncomplete = () => resolve(taken)
      tx.onerror = () => resolve(null)
      tx.onabort = () => resolve(null)
    })
  } finally {
    db.close()
  }
}

/** How many offline sales this till could still ring up before it must reconnect. */
export async function numbersRemaining(tenantId) {
  const row = await readReservation(tenantId)
  return Array.isArray(row?.numbers) ? row.numbers.length : 0
}

// ── Sales waiting to be sent ─────────────────────────────────────────────────

export async function enqueueSale(tenantId, invoice) {
  // Keyed by the invoice's own id, which came from the reserved block and is
  // already unique. Queueing the same sale twice is therefore impossible even
  // if the checkout handler is somehow entered twice.
  await withDb(tenantId, QUEUE, 'readwrite', (s) =>
    s.put({ localId: invoice.id, invoice, queuedAt: new Date().toISOString() }))
}

export async function listQueue(tenantId) {
  const rows = await withDb(tenantId, QUEUE, 'readonly', (s) => s.getAll())
  return Array.isArray(rows) ? rows : []
}

/**
 * One queued sale by its invoice id, for the receipt screen — which is where
 * checkout lands, and which has to be able to print a sale that has not
 * reached the server yet.
 */
export async function findQueuedSale(tenantId, invoiceId) {
  const row = await withDb(tenantId, QUEUE, 'readonly', (s) => s.get(invoiceId))
  return row?.invoice ?? null
}

export async function queueLength(tenantId) {
  const n = await withDb(tenantId, QUEUE, 'readonly', (s) => s.count())
  return typeof n === 'number' ? n : 0
}

export async function dropFromQueue(tenantId, localIds) {
  const ids = Array.isArray(localIds) ? localIds : [localIds]
  if (!ids.length) return
  await withDb(tenantId, QUEUE, 'readwrite', (s) => {
    for (const id of ids) s.delete(id)
    return null
  })
}
