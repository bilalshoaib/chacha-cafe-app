import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { getInvoices, saveInvoices } from '@/lib/repositories/invoicesRepository'
import { randomUUID } from 'crypto'

function newLineId() {
  return `l-${randomUUID().slice(0, 8)}`
}

function validateAndNormalizeLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return { error: 'At least one line is required.' }
  const out = []
  let subtotal = 0
  for (const raw of lines) {
    const kind = raw?.kind
    if (kind !== 'item' && kind !== 'deal') return { error: 'Each line must have kind "item" or "deal".' }
    const qty = Number(raw.qty)
    const unitPrice = Number(raw.unitPrice)
    const lineTotal = Number(raw.lineTotal)
    if (!Number.isFinite(qty) || qty < 1) return { error: 'Each line needs a valid qty ≥ 1.' }
    const qInt = Math.floor(qty)
    if (Math.abs(qty - qInt) > 1e-6) return { error: 'Quantity must be a whole number.' }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return { error: 'Each line needs a valid unit price.' }
    if (!Number.isFinite(lineTotal)) return { error: 'Each line needs a valid line total.' }
    const q = qInt
    const expected = Math.round(unitPrice * q * 100) / 100
    if (Math.abs(lineTotal - expected) > 0.02) return { error: `Line total must equal qty × unit price (${expected}).` }
    const name = String(raw.name ?? '').trim().slice(0, 200)
    if (!name) return { error: 'Each line needs a name.' }
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : newLineId()
    if (kind === 'item') {
      if (!raw.refId) return { error: 'Item lines need refId.' }
      const line = { id, kind: 'item', refId: String(raw.refId), name, category: String(raw.category ?? 'other').slice(0, 40), qty: q, unitPrice, lineTotal }
      if (raw.size) line.size = String(raw.size).slice(0, 60)
      if (raw.flavour) line.flavour = String(raw.flavour).slice(0, 80)
      out.push(line)
    } else {
      if (!raw.refId) return { error: 'Deal lines need refId.' }
      const dealIncludes = Array.isArray(raw.dealIncludes)
        ? raw.dealIncludes.map((inc) => ({ itemId: String(inc.itemId), qty: Math.max(1, Math.floor(Number(inc.qty)) || 1) }))
        : []
      out.push({ id, kind: 'deal', refId: String(raw.refId), name, qty: q, unitPrice, lineTotal, dealIncludes })
    }
    subtotal += lineTotal
  }
  subtotal = Math.round(subtotal * 100) / 100
  return { lines: out, subtotal, total: subtotal }
}

export async function GET(_request, { params }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const invoices = await getInvoices()
  const inv = invoices.find((i) => i.id === id)
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  return NextResponse.json(inv)
}

export async function PATCH(request, { params }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const invoices = await getInvoices()
  const idx = invoices.findIndex((i) => i.id === id)
  if (idx === -1) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  const inv = invoices[idx]
  const { customerNote, paid, returned, returnNote, lines, paymentMethod } = await request.json().catch(() => ({}))

  if (inv.returned) {
    if (lines !== undefined) return NextResponse.json({ error: 'Cannot change lines on a returned invoice.' }, { status: 400 })
    if (customerNote !== undefined) return NextResponse.json({ error: 'Cannot edit the customer note on a returned invoice.' }, { status: 400 })
  }

  if (lines !== undefined) {
    const normalized = validateAndNormalizeLines(lines)
    if (normalized.error) return NextResponse.json({ error: normalized.error }, { status: 400 })
    inv.lines = normalized.lines
    inv.subtotal = normalized.subtotal
    inv.total = normalized.total
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

  await saveInvoices(invoices)
  return NextResponse.json(inv)
}
