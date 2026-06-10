import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import {
  loadMenu,
  saveMenu,
  normalizeCategory,
  optionalTrimmedString,
  newItemId,
} from '@/lib/repositories/menuRepository'
import { parseMenuItemBusinessType } from '@/lib/businessTypes'

export async function POST(request) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { name, category, price } = body
  const p = Number(price)

  if (!name || typeof name !== 'string' || !String(name).trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!Number.isFinite(p) || p <= 0) {
    return NextResponse.json({ error: 'price must be a positive number' }, { status: 400 })
  }

  const cat = normalizeCategory(category)
  const size = optionalTrimmedString(body.size, 60)
  const flavour = optionalTrimmedString(body.flavour, 80)
  const businessType = parseMenuItemBusinessType(body.businessType, { category: cat, businessType: null })
  if (businessType === null) {
    return NextResponse.json({ error: 'businessType must be cafe, burger, or both.' }, { status: 400 })
  }

  const menu = await loadMenu()
  const item = {
    id: newItemId(),
    name: String(name).trim().slice(0, 120),
    category: cat,
    businessType,
    price: Math.round(p * 100) / 100,
    ...(size ? { size } : {}),
    ...(flavour ? { flavour } : {}),
  }
  menu.items.push(item)
  await saveMenu(menu)
  return NextResponse.json(item, { status: 201 })
}
