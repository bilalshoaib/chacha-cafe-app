import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { loadMenu, saveMenu } from '@/lib/repositories/menuRepository'
import { dealBusinessType, itemMatchesBusiness, normalizeBusinessType, businessTypeLabel } from '@/lib/businessTypes'

function validateDealIncludes(menu, includes, businessType) {
  if (!Array.isArray(includes) || includes.length === 0) {
    return { error: 'non-empty includes[] required' }
  }
  const itemIds = new Set(menu.items.map((i) => i.id))
  const out = []
  for (const row of includes) {
    const qty = Number(row.qty)
    if (!row.itemId || !Number.isFinite(qty) || qty < 1 || !itemIds.has(row.itemId)) {
      return { error: 'Each include needs valid itemId and qty >= 1' }
    }
    const item = menu.items.find((i) => i.id === row.itemId)
    if (item && !itemMatchesBusiness(item, businessType)) {
      return { error: `Included item "${item.name}" is not available for ${businessTypeLabel(businessType)}.` }
    }
    out.push({ itemId: String(row.itemId), qty: Math.floor(qty) })
  }
  return { includes: out }
}

export async function PATCH(request, { params }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const menu = await loadMenu()
  const idx = menu.deals.findIndex((d) => d.id === id)
  if (idx === -1) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  const deal = menu.deals[idx]
  const body = await request.json().catch(() => ({}))
  const { name, price, includes, businessType, cafeSplit, burgerSplit } = body

  if (name !== undefined) {
    if (!name || typeof name !== 'string' || !String(name).trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    deal.name = String(name).trim().slice(0, 120)
  }

  const incomingBt = businessType !== undefined
    ? (String(businessType).toLowerCase() === 'combined' ? 'combined' : normalizeBusinessType(businessType))
    : null
  if (businessType !== undefined) {
    if (!incomingBt) return NextResponse.json({ error: 'businessType must be cafe, burger, or combined.' }, { status: 400 })
    deal.businessType = incomingBt
  }

  const effectiveBt = deal.businessType === 'combined' ? 'combined' : dealBusinessType(deal, menu.items)

  if (effectiveBt === 'combined') {
    if (price !== undefined || cafeSplit !== undefined || burgerSplit !== undefined) {
      const newPrice = price !== undefined ? Number(price) : deal.price
      const newCafe = cafeSplit !== undefined ? Number(cafeSplit) : deal.cafeSplit ?? 0
      const newBurger = burgerSplit !== undefined ? Number(burgerSplit) : deal.burgerSplit ?? 0
      if (!Number.isFinite(newPrice) || newPrice <= 0) return NextResponse.json({ error: 'price must be a positive number' }, { status: 400 })
      if (!Number.isFinite(newCafe) || newCafe < 0 || !Number.isFinite(newBurger) || newBurger < 0) {
        return NextResponse.json({ error: 'cafeSplit and burgerSplit must be non-negative numbers.' }, { status: 400 })
      }
      if (Math.abs(Math.round((newCafe + newBurger) * 100) / 100 - Math.round(newPrice * 100) / 100) > 0.01) {
        return NextResponse.json({ error: 'cafeSplit + burgerSplit must equal the bundle price.' }, { status: 400 })
      }
      deal.price = Math.round(newPrice * 100) / 100
      deal.cafeSplit = Math.round(newCafe * 100) / 100
      deal.burgerSplit = Math.round(newBurger * 100) / 100
    }
  } else {
    delete deal.cafeSplit
    delete deal.burgerSplit
    if (price !== undefined) {
      const p = Number(price)
      if (!Number.isFinite(p) || p <= 0) return NextResponse.json({ error: 'price must be a positive number' }, { status: 400 })
      deal.price = Math.round(p * 100) / 100
    }
  }

  if (includes !== undefined) {
    const validated = validateDealIncludes(menu, includes, effectiveBt === 'combined' ? 'cafe' : effectiveBt)
    if (validated.error) return NextResponse.json({ error: validated.error }, { status: 400 })
    deal.includes = validated.includes
  }

  await saveMenu(menu)
  return NextResponse.json(deal)
}
