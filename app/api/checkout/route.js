import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { requireTenant } from '@/lib/session'
import { loadMenu } from '@/lib/repositories/menuRepository'
import { saveInvoice, nextInvoiceNumber, nextShiftNumber } from '@/lib/repositories/invoicesRepository'
import { getTenantDayHours } from '@/lib/repositories/tenantsRepository'
import { buildOrderLine } from '@/lib/orderLines'
import { invoiceBusinessTypeForLines } from '@/lib/businessTypes'
import { shiftDateForInstant } from '@/lib/shift'

/**
 * Every invoice draws its number from one continuous sequence, whichever
 * business it belongs to.
 *
 * Which business that is lives in the business_type column, which is what the
 * reports read — encoding it in the id as well would mean three parallel
 * series, two of them starting from 1 partway through the café's life, while
 * staff look invoices up by the number printed on the receipt.
 *
 * The sequence is still named invoice_seq_combined: it is the one that has
 * been issuing numbers since June 2026 and holds the current position, and
 * renaming it on a live database would buy nothing. The multi-tenant work
 * replaces all three with a per-location counters table.
 */
const INVOICE_SEQUENCE = 'combined'

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
  const stats = {}
  const isColdRequest = requestsServedByThisInstance === 0
  const instanceAgeAtEntry = Date.now() - MODULE_LOADED_AT
  requestsServedByThisInstance += 1

  // finally, not a trailing call, so a slow request that ends in an early
  // return or a throw still reports its timings.
  try {
    return await handleCheckout(request, marks, stats)
  } finally {
    const totalMs = Math.round(performance.now() - requestStarted)
    console.log(
      `[checkout] total=${totalMs}ms ${marks.join(' ')} ` +
      `lines=${stats.lineCount ?? 0} menuItems=${stats.menuItems ?? 0} menuDeals=${stats.menuDeals ?? 0} ` +
      `cold=${isColdRequest} instanceAgeMs=${instanceAgeAtEntry} reqOnInstance=${requestsServedByThisInstance} ` +
      `poolTotal=${pool.totalCount} poolIdle=${pool.idleCount} poolWaiting=${pool.waitingCount}`,
    )
  }
}

async function handleCheckout(request, marks, stats) {
  const ctx = await timed(marks, 'requireTenant', () => requireTenant())
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const rawLines = Array.isArray(body.lines) ? body.lines : []
  if (!rawLines.length) return NextResponse.json({ error: 'Add at least one line before checkout' }, { status: 400 })

  // 3 queries in parallel: SELECT * on menu_items, deals, deal_includes.
  const menu = await timed(marks, 'loadMenu', () => loadMenu(ctx))
  stats.menuItems = menu.items.length
  stats.menuDeals = menu.deals.length

  const lines = []
  for (const raw of rawLines) {
    const { line, error, status } = buildOrderLine(raw, menu)
    if (error) return NextResponse.json({ error }, { status: status || 400 })
    lines.push(line)
  }
  stats.lineCount = lines.length

  const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100
  const businessType = invoiceBusinessTypeForLines(lines)

  const VALID_PAYMENT_METHODS = ['cash', 'online']
  const paymentMethod = VALID_PAYMENT_METHODS.includes(body.paymentMethod) ? body.paymentMethod : null

  const VALID_ORDER_TYPES = ['takeaway', 'dine_in', 'delivery']
  const orderType = VALID_ORDER_TYPES.includes(body.orderType) ? body.orderType : null

  const rawDeliveryCharge = Number(body.deliveryCharge)
  const deliveryCharge = orderType === 'delivery' && Number.isFinite(rawDeliveryCharge) && rawDeliveryCharge > 0
    ? Math.round(rawDeliveryCharge * 100) / 100
    : 0
  const total = Math.round((subtotal + deliveryCharge) * 100) / 100

  const invoiceNum = await timed(marks, 'nextInvoiceNumber', () => nextInvoiceNumber(INVOICE_SEQUENCE))
  const createdAt = new Date()
  // Which day this sale belongs to, by this café's clock rather than by
  // Chacha's. A breakfast place opening at seven had every morning's takings
  // counted against the day before, and its order numbers resetting mid
  // service, because the hour was a constant in lib/shift.js.
  //
  // Free of a round trip: requireTenant() read and cached this row on the way
  // into this same request.
  const { startHour } = await timed(marks, 'tenantDayHours', () => getTenantDayHours(ctx.tenantId))
  const shiftDate = shiftDateForInstant(createdAt, { shiftStartHour: startHour })
  const shiftNumber = await timed(marks, 'nextShiftNumber', () => nextShiftNumber(ctx, shiftDate))

  const invoice = {
    id: `inv-${invoiceNum}`,
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

  await timed(marks, 'saveInvoice', () => saveInvoice(ctx, invoice))
  return NextResponse.json({ invoice }, { status: 201 })
}
