import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import {
  loadMenu,
  saveMenu,
  normalizeCategory,
  optionalTrimmedString,
} from '@/lib/repositories/menuRepository'
import { parseMenuItemBusinessType } from '@/lib/businessTypes'

export async function PATCH(request, { params }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const menu = await loadMenu()
  const idx = menu.items.findIndex((i) => i.id === id)
  if (idx === -1) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const item = menu.items[idx]
  const body = await request.json().catch(() => ({}))
  const { name, category, price, size, flavour } = body

  if (name !== undefined) {
    if (!name || typeof name !== 'string' || !String(name).trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    item.name = String(name).trim().slice(0, 120)
  }
  if (category !== undefined) item.category = normalizeCategory(category)
  if (body.businessType !== undefined) {
    const bt = parseMenuItemBusinessType(body.businessType, item)
    if (bt === null) return NextResponse.json({ error: 'businessType must be cafe, burger, or both.' }, { status: 400 })
    item.businessType = bt
  }
  if (price !== undefined) {
    const p = Number(price)
    if (!Number.isFinite(p) || p <= 0) return NextResponse.json({ error: 'price must be a positive number' }, { status: 400 })
    item.price = Math.round(p * 100) / 100
  }
  if (size !== undefined) {
    const s = optionalTrimmedString(size, 60)
    if (s) item.size = s
    else delete item.size
  }
  if (flavour !== undefined) {
    const f = optionalTrimmedString(flavour, 80)
    if (f) item.flavour = f
    else delete item.flavour
  }

  await saveMenu(menu)
  return NextResponse.json(item)
}

export async function DELETE(_request, { params }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const menu = await loadMenu()
  const idx = menu.items.findIndex((i) => i.id === id)
  if (idx === -1) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  for (const d of menu.deals) {
    if (d.includes?.some((inc) => inc.itemId === id)) {
      return NextResponse.json({ error: 'This item is used in a deal. Edit or remove that deal first.' }, { status: 400 })
    }
  }
  menu.items.splice(idx, 1)
  await saveMenu(menu)
  return NextResponse.json({ ok: true, id })
}
