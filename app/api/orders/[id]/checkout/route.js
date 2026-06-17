import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { getOrders, saveOrders } from '@/lib/repositories/ordersRepository'
import { getInvoices, saveInvoices, nextInvoiceNumber } from '@/lib/repositories/invoicesRepository'
import { orderBusinessType } from '@/lib/businessTypes'

function invoiceSlug(businessType) {
  if (businessType === 'burger') return 'burger'
  if (businessType === 'combined') return 'combined'
  return 'cafe'
}

export async function POST(request, { params }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const orders = await getOrders()
  const invoices = await getInvoices()
  const oi = orders.findIndex((o) => o.id === id)
  if (oi === -1) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const order = orders[oi]
  if (order.status !== 'open') return NextResponse.json({ error: 'Order already checked out or closed' }, { status: 400 })
  if (!order.lines.length) return NextResponse.json({ error: 'Add at least one line before checkout' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const total = Math.round(order.lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100
  const businessType = orderBusinessType(order)

  const VALID_PAYMENT_METHODS = ['cash', 'online']
  const paymentMethod = VALID_PAYMENT_METHODS.includes(body.paymentMethod) ? body.paymentMethod : null

  const slug = invoiceSlug(businessType)
  const invoiceNum = await nextInvoiceNumber(slug)

  const invoice = {
    id: `inv-${slug}-${invoiceNum}`,
    businessType,
    orderId: order.id,
    createdAt: new Date().toISOString(),
    customerNote: body.customerNote ? String(body.customerNote).slice(0, 200) : '',
    lines: order.lines.map((l) => ({ ...l })),
    subtotal: total,
    total,
    ...(paymentMethod ? { paymentMethod } : {}),
  }
  invoices.push(invoice)
  order.status = 'invoiced'
  order.invoicedAt = invoice.createdAt
  order.invoiceId = invoice.id
  await saveInvoices(invoices)
  await saveOrders(orders)
  return NextResponse.json({ invoice, order }, { status: 201 })
}
