import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { getOrders, saveOrders } from '@/lib/repositories/ordersRepository'

export async function PATCH(request, { params }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId, lineId } = await params
  const body = await request.json().catch(() => ({}))

  const orders = await getOrders()
  const oi = orders.findIndex((o) => o.id === orderId)
  if (oi === -1) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (orders[oi].status !== 'open') return NextResponse.json({ error: 'Order is not open' }, { status: 400 })
  const line = orders[oi].lines.find((l) => l.id === lineId)
  if (!line) return NextResponse.json({ error: 'Line not found' }, { status: 404 })

  if ('qty' in body) {
    const quantity = Number(body.qty)
    if (!Number.isFinite(quantity) || quantity < 1) {
      return NextResponse.json({ error: 'qty must be a number ≥ 1' }, { status: 400 })
    }
    const q = Math.floor(quantity)
    if (Math.abs(quantity - q) > 1e-6) {
      return NextResponse.json({ error: 'Quantity must be a whole number' }, { status: 400 })
    }
    line.qty = q
  }

  if ('discount' in body) {
    const d = Number(body.discount)
    if (!Number.isFinite(d) || d < 0) {
      return NextResponse.json({ error: 'discount must be a number ≥ 0' }, { status: 400 })
    }
    if (d === 0) {
      delete line.discount
    } else {
      line.discount = Math.round(d * 100) / 100
    }
  }

  const gross = Math.round(Number(line.unitPrice) * line.qty * 100) / 100
  const discountAmt = line.discount ?? 0
  line.lineTotal = Math.round(Math.max(0, gross - discountAmt) * 100) / 100

  await saveOrders(orders)
  return NextResponse.json(orders[oi])
}

export async function DELETE(_request, { params }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId, lineId } = await params
  const orders = await getOrders()
  const oi = orders.findIndex((o) => o.id === orderId)
  if (oi === -1) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (orders[oi].status !== 'open') return NextResponse.json({ error: 'Order is not open' }, { status: 400 })

  const before = orders[oi].lines.length
  orders[oi].lines = orders[oi].lines.filter((l) => l.id !== lineId)
  if (orders[oi].lines.length === before) return NextResponse.json({ error: 'Line not found' }, { status: 404 })

  await saveOrders(orders)
  return NextResponse.json(orders[oi])
}
