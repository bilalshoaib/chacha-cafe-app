import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { requireAuth } from '@/lib/session'
import { loadMenu } from '@/lib/repositories/menuRepository'
import { saveInvoice, nextInvoiceNumber, nextShiftNumber } from '@/lib/repositories/invoicesRepository'
import { buildOrderLine } from '@/lib/orderLines'
import { shiftDateForInstant } from '@/lib/shift'

function invoiceSlug(businessType) {
  if (businessType === 'burger') return 'burger'
  if (businessType === 'combined') return 'combined'
  return 'cafe'
}

// ── Timing instrumentation ───────────────────────────────────────────────────
// Module scope runs once per lambda instance, so MODULE_LOADED_AT lets us tell
// "this request was slow" apart from "this instance was cold and boot was slow"
// — including the instrumentation.js migration pass that precedes the first
// request on every new instance.
const MODULE_LOADED_AT = Date.now()
let requestsServedByThisInstance = 0

/** Times an awaited step and logs its duration. Returns the step's value. */
async function timed(marks, label, fn) {
  const started = performance.now()
  try {
    return await fn()
  } finally {
    const ms = Math.round(performance.now() - started)
    marks.push(`${label}=${ms}ms`)
  }
}

/**
 * Creates an invoice directly from a client-held cart. Orders are managed
 * entirely on the frontend while in progress — nothing is persisted until
 * checkout, at which point the full set of lines is validated and priced
 * here (against the live menu) and saved straight to the invoices table.
 */
export async function POST(request) {
  const requestStarted = performance.now()
  const marks = []
  const ctx = {}
  const isColdRequest = requestsServedByThisInstance === 0
  const instanceAgeAtEntry = Date.now() - MODULE_LOADED_AT
  requestsServedByThisInstance += 1

  // finally, not a trailing call, so a slow request that ends in an early
  // return or a throw still reports its timings.
  try {
    return await handleCheckout(request, marks, ctx)
  } finally {
    const totalMs = Math.round(performance.now() - requestStarted)
    console.log(
      `[checkout] total=${totalMs}ms ${marks.join(' ')} ` +
      `lines=${ctx.lineCount ?? 0} menuItems=${ctx.menuItems ?? 0} menuDeals=${ctx.menuDeals ?? 0} ` +
      `cold=${isColdRequest} instanceAgeMs=${instanceAgeAtEntry} reqOnInstance=${requestsServedByThisInstance} ` +
      `poolTotal=${pool.totalCount} poolIdle=${pool.idleCount} poolWaiting=${pool.waitingCount}`,
    )
  }
}

async function handleCheckout(request, marks, ctx) {
  const session = await timed(marks, 'requireAuth', () => requireAuth())
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const rawLines = Array.isArray(body.lines) ? body.lines : []
  if (!rawLines.length) return NextResponse.json({ error: 'Add at least one line before checkout' }, { status: 400 })

  // 3 queries in parallel: SELECT * on menu_items, deals, deal_includes.
  const menu = await timed(marks, 'loadMenu', () => loadMenu())
  ctx.menuItems = menu.items.length
  ctx.menuDeals = menu.deals.length

  const lines = []
  for (const raw of rawLines) {
    const { line, error, status } = buildOrderLine(raw, menu)
    if (error) return NextResponse.json({ error }, { status: status || 400 })
    lines.push(line)
  }
  ctx.lineCount = lines.length

  const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100
  const businessType = 'combined'

  const VALID_PAYMENT_METHODS = ['cash', 'online']
  const paymentMethod = VALID_PAYMENT_METHODS.includes(body.paymentMethod) ? body.paymentMethod : null

  const VALID_ORDER_TYPES = ['takeaway', 'dine_in', 'delivery']
  const orderType = VALID_ORDER_TYPES.includes(body.orderType) ? body.orderType : null

  const rawDeliveryCharge = Number(body.deliveryCharge)
  const deliveryCharge = orderType === 'delivery' && Number.isFinite(rawDeliveryCharge) && rawDeliveryCharge > 0
    ? Math.round(rawDeliveryCharge * 100) / 100
    : 0
  const total = Math.round((subtotal + deliveryCharge) * 100) / 100

  const slug = invoiceSlug(businessType)
  const invoiceNum = await timed(marks, 'nextInvoiceNumber', () => nextInvoiceNumber(slug))
  const createdAt = new Date()
  const shiftDate = shiftDateForInstant(createdAt)
  const shiftNumber = await timed(marks, 'nextShiftNumber', () => nextShiftNumber(shiftDate))

  const invoice = {
    id: `inv-${slug}-${invoiceNum}`,
    businessType,
    orderId: null,
    createdAt: createdAt.toISOString(),
    customerNote: body.customerNote ? String(body.customerNote).slice(0, 200) : '',
    lines,
    subtotal,
    total,
    deliveryCharge,
    shiftDate,
    shiftNumber,
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(orderType ? { orderType } : {}),
  }

  await timed(marks, 'saveInvoice', () => saveInvoice(invoice))
  return NextResponse.json({ invoice }, { status: 201 })
}
