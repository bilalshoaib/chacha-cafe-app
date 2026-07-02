import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { loadMenu } from '@/lib/repositories/menuRepository'
import { getInvoices, saveInvoices, nextInvoiceNumber } from '@/lib/repositories/invoicesRepository'
import { buildOrderLine } from '@/lib/orderLines'

function invoiceSlug(businessType) {
  if (businessType === 'burger') return 'burger'
  if (businessType === 'combined') return 'combined'
  return 'cafe'
}

/**
 * Creates an invoice directly from a client-held cart. Orders are managed
 * entirely on the frontend while in progress — nothing is persisted until
 * checkout, at which point the full set of lines is validated and priced
 * here (against the live menu) and saved straight to the invoices table.
 */
export async function POST(request) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const rawLines = Array.isArray(body.lines) ? body.lines : []
  if (!rawLines.length) return NextResponse.json({ error: 'Add at least one line before checkout' }, { status: 400 })

  const menu = await loadMenu()
  const lines = []
  for (const raw of rawLines) {
    const { line, error, status } = buildOrderLine(raw, menu)
    if (error) return NextResponse.json({ error }, { status: status || 400 })
    lines.push(line)
  }

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
  const invoiceNum = await nextInvoiceNumber(slug)

  const invoice = {
    id: `inv-${slug}-${invoiceNum}`,
    businessType,
    orderId: null,
    createdAt: new Date().toISOString(),
    customerNote: body.customerNote ? String(body.customerNote).slice(0, 200) : '',
    lines,
    subtotal,
    total,
    deliveryCharge,
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(orderType ? { orderType } : {}),
  }

  const invoices = await getInvoices()
  invoices.push(invoice)
  await saveInvoices(invoices)
  return NextResponse.json({ invoice }, { status: 201 })
}
