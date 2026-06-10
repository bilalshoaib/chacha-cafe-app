import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { getOrders, saveOrders } from '@/lib/repositories/ordersRepository'
import { loadMenu } from '@/lib/repositories/menuRepository'
import {
  dealBusinessType,
  itemBusinessType,
  itemMatchesBusiness,
  normalizeBusinessType,
  orderBusinessType,
  businessTypeLabel,
} from '@/lib/businessTypes'
import { randomUUID } from 'crypto'

function newLineId() {
  return `l-${randomUUID().slice(0, 8)}`
}

function parseDiscount(raw, maxValue) {
  const d = Number(raw)
  if (!Number.isFinite(d) || d <= 0) return 0
  return Math.round(Math.min(d, maxValue) * 100) / 100
}

export async function POST(request, { params }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { kind, refId, qty, discount } = await request.json().catch(() => ({}))
  const quantity = Number(qty)
  if (!['item', 'deal'].includes(kind) || !refId || !Number.isFinite(quantity) || quantity < 1) {
    return NextResponse.json({ error: 'kind (item|deal), refId, qty>=1 required' }, { status: 400 })
  }

  const menu = await loadMenu()
  const orders = await getOrders()
  const idx = orders.findIndex((o) => o.id === id)
  if (idx === -1) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (orders[idx].status !== 'open') return NextResponse.json({ error: 'Order is not open' }, { status: 400 })

  const orderType = orderBusinessType(orders[idx])
  let line

  if (kind === 'item') {
    const item = menu.items.find((i) => i.id === refId)
    if (!item) return NextResponse.json({ error: 'Menu item not found' }, { status: 404 })
    if (!itemMatchesBusiness(item, orderType)) {
      return NextResponse.json({
        error: `"${item.name}" is on the ${businessTypeLabel(itemBusinessType(item))} menu. This order is for ${businessTypeLabel(orderType)}.`,
      }, { status: 400 })
    }
    const gross = Math.round(item.price * quantity * 100) / 100
    const discountAmt = parseDiscount(discount, gross)
    line = {
      id: newLineId(),
      kind: 'item',
      refId: item.id,
      name: item.name,
      category: item.category,
      qty: quantity,
      unitPrice: item.price,
      ...(discountAmt > 0 ? { discount: discountAmt } : {}),
      lineTotal: Math.round(Math.max(0, gross - discountAmt) * 100) / 100,
      ...(item.size ? { size: item.size } : {}),
      ...(item.flavour ? { flavour: item.flavour } : {}),
    }
  } else {
    const deal = menu.deals.find((d) => d.id === refId)
    if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    if (deal.status === 'archived') {
      return NextResponse.json({ error: `"${deal.name}" has been archived and cannot be added to orders.` }, { status: 400 })
    }
    const dealType = dealBusinessType(deal, menu.items)
    if (dealType !== 'combined' && dealType !== orderType) {
      return NextResponse.json({
        error: `"${deal.name}" is a ${businessTypeLabel(dealType)} deal. This order is for ${businessTypeLabel(orderType)}.`,
      }, { status: 400 })
    }
    const gross = Math.round(deal.price * quantity * 100) / 100
    const discountAmt = parseDiscount(discount, gross)
    line = {
      id: newLineId(),
      kind: 'deal',
      refId: deal.id,
      name: deal.name,
      qty: quantity,
      unitPrice: deal.price,
      ...(discountAmt > 0 ? { discount: discountAmt } : {}),
      lineTotal: Math.round(Math.max(0, gross - discountAmt) * 100) / 100,
      dealIncludes: deal.includes,
      ...(dealType === 'combined' ? { isCombined: true, cafeSplit: deal.cafeSplit ?? 0, burgerSplit: deal.burgerSplit ?? 0 } : {}),
    }
  }

  orders[idx].lines.push(line)
  await saveOrders(orders)
  return NextResponse.json(orders[idx], { status: 201 })
}
