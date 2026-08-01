import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { loadMenu, saveMenu, newDealId, parseDealIncludes } from '@/lib/repositories/menuRepository'
import { dealBusinessType, normalizeBusinessType } from '@/lib/businessTypes'

export async function POST(request) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { name, price, includes } = body
  if (!name || typeof price !== 'number' || !Array.isArray(includes) || includes.length === 0) {
    return NextResponse.json({ error: 'name, price (number), and non-empty includes[] required' }, { status: 400 })
  }
  const menu = await loadMenu()
  const parsedIncludes = parseDealIncludes(includes, new Set(menu.items.map((i) => i.id)))
  if (parsedIncludes.error) return NextResponse.json({ error: parsedIncludes.error }, { status: 400 })
  const cleanIncludes = parsedIncludes.includes

  const rawBt = body.businessType
  const isCombined = String(rawBt ?? '').toLowerCase() === 'combined'

  if (isCombined) {
    const cafeSplit = Number(body.cafeSplit)
    const burgerSplit = Number(body.burgerSplit)
    if (!Number.isFinite(cafeSplit) || cafeSplit < 0 || !Number.isFinite(burgerSplit) || burgerSplit < 0) {
      return NextResponse.json({ error: 'cafeSplit and burgerSplit must be non-negative numbers for combined deals.' }, { status: 400 })
    }
    const expectedTotal = Math.round((cafeSplit + burgerSplit) * 100) / 100
    if (Math.abs(expectedTotal - Math.round(price * 100) / 100) > 0.01) {
      return NextResponse.json({ error: 'cafeSplit + burgerSplit must equal the bundle price.' }, { status: 400 })
    }
    const deal = {
      id: newDealId(),
      name: String(name).trim(),
      businessType: 'combined',
      price: Math.round(price * 100) / 100,
      cafeSplit: Math.round(cafeSplit * 100) / 100,
      burgerSplit: Math.round(burgerSplit * 100) / 100,
      includes: cleanIncludes,
    }
    menu.deals.push(deal)
    await saveMenu(menu)
    return NextResponse.json(deal, { status: 201 })
  }

  const businessType = normalizeBusinessType(rawBt) || dealBusinessType({ includes: cleanIncludes }, menu.items)
  const deal = {
    id: newDealId(),
    name: String(name).trim().slice(0, 120),
    businessType,
    price: Math.round(price * 100) / 100,
    includes: cleanIncludes,
  }
  menu.deals.push(deal)
  await saveMenu(menu)
  return NextResponse.json(deal, { status: 201 })
}
