import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { getInvoiceById, saveInvoice } from '@/lib/repositories/invoicesRepository'
import { loadMenu } from '@/lib/repositories/menuRepository'
import { buildOrderLine } from '@/lib/orderLines'

/** Re-prices a line whose product is no longer on the menu, using the price the
 *  invoice already recorded — never one supplied by the request. */
function repriceFromStored(stored, qty, rawDiscount) {
  const gross = Math.round(stored.unitPrice * qty * 100) / 100
  const d = Number(rawDiscount)
  const discount = Number.isFinite(d) && d > 0 ? Math.round(Math.min(d, gross) * 100) / 100 : 0
  const line = { ...stored, qty, lineTotal: Math.round(Math.max(0, gross - discount) * 100) / 100 }
  if (discount > 0) line.discount = discount
  else delete line.discount
  return line
}

/**
 * Rebuilds the submitted lines by pricing every one of them against the live
 * menu, exactly as checkout does. The request supplies only which product and
 * how many — name, unit price and line total are always the server's, so an
 * edit cannot introduce a total the server didn't compute.
 */
function repriceLines(rawLines, menu, storedLines) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { error: 'At least one line is required.' }
  }

  const storedByRef = new Map()
  for (const l of storedLines) storedByRef.set(`${l.kind}:${l.refId}`, l)

  const out = []
  let subtotal = 0
  for (const raw of rawLines) {
    const kind = raw?.kind
    if (kind !== 'item' && kind !== 'deal') return { error: 'Each line must have kind "item" or "deal".' }
    if (!raw?.refId) return { error: `${kind === 'deal' ? 'Deal' : 'Item'} lines need refId.` }
    const qty = Number(raw.qty)
    if (!Number.isFinite(qty) || qty < 1) return { error: 'Each line needs a valid qty ≥ 1.' }
    if (Math.floor(qty) !== qty) return { error: 'Quantity must be a whole number.' }

    const { line, error, status } = buildOrderLine(raw, menu, { allowArchived: true })
    let next = line
    if (error) {
      // Item or deal has since been removed from the menu; keep the invoice
      // editable by falling back to its own recorded price.
      const stored = storedByRef.get(`${kind}:${raw.refId}`)
      if (!stored) return { error, status }
      next = repriceFromStored(stored, qty, raw.discount)
    }
    // Preserve the caller's line id so line identity survives an edit.
    if (typeof raw.id === 'string' && raw.id.trim()) next.id = raw.id.trim().slice(0, 50)
    out.push(next)
    subtotal += next.lineTotal
  }

  return { lines: out, subtotal: Math.round(subtotal * 100) / 100 }
}

export async function GET(_request, { params }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const inv = await getInvoiceById(id)
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  return NextResponse.json(inv)
}

export async function PATCH(request, { params }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const inv = await getInvoiceById(id)
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  const { customerNote, paid, returned, returnNote, lines, paymentMethod } = await request.json().catch(() => ({}))

  if (inv.returned) {
    if (lines !== undefined) return NextResponse.json({ error: 'Cannot change lines on a returned invoice.' }, { status: 400 })
    if (customerNote !== undefined) return NextResponse.json({ error: 'Cannot edit the customer note on a returned invoice.' }, { status: 400 })
  }

  if (lines !== undefined) {
    const menu = await loadMenu()
    const repriced = repriceLines(lines, menu, inv.lines)
    if (repriced.error) return NextResponse.json({ error: repriced.error }, { status: repriced.status || 400 })
    inv.lines = repriced.lines
    inv.subtotal = repriced.subtotal
    // Delivery is charged on top of the lines, same as at checkout.
    inv.total = Math.round((repriced.subtotal + (inv.deliveryCharge ?? 0)) * 100) / 100
  }
  if (customerNote !== undefined) inv.customerNote = String(customerNote).slice(0, 200)
  if (paid !== undefined) {
    if (!Boolean(paid) && session.role === 'counter_cashier') {
      return NextResponse.json({ error: 'Counter cashier accounts cannot mark an invoice as unpaid.' }, { status: 403 })
    }
    inv.paid = Boolean(paid)
    if (inv.paid) { if (!inv.paidAt) inv.paidAt = new Date().toISOString() }
    else delete inv.paidAt
  }
  if (returned !== undefined) {
    inv.returned = Boolean(returned)
    if (inv.returned) { if (!inv.returnedAt) inv.returnedAt = new Date().toISOString() }
    else { delete inv.returnedAt; delete inv.returnNote }
  }
  if (returnNote !== undefined && inv.returned) inv.returnNote = String(returnNote).slice(0, 300)
  const VALID_PAYMENT_METHODS = ['cash', 'online']
  if (paymentMethod !== undefined) inv.paymentMethod = VALID_PAYMENT_METHODS.includes(paymentMethod) ? paymentMethod : null

  await saveInvoice(inv)
  return NextResponse.json(inv)
}
