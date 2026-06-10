import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { getOrders, saveOrders } from '@/lib/repositories/ordersRepository'
import { normalizeBusinessType } from '@/lib/businessTypes'
import { randomUUID } from 'crypto'

function newOrderId() {
  return `o-${randomUUID().slice(0, 8)}`
}

export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const orders = await getOrders()
  return NextResponse.json(orders)
}

export async function POST(request) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const businessType = normalizeBusinessType(body.businessType)
  if (!businessType) {
    return NextResponse.json({ error: 'businessType must be cafe or burger.' }, { status: 400 })
  }
  const orders = await getOrders()
  const order = {
    id: newOrderId(),
    businessType,
    createdAt: new Date().toISOString(),
    status: 'open',
    lines: [],
  }
  orders.push(order)
  await saveOrders(orders)
  return NextResponse.json(order, { status: 201 })
}
