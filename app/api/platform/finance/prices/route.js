import { NextResponse } from 'next/server'
import { requirePlatformOwner } from '@/lib/session'
import { listPlanPrices, setPlanPrice } from '@/lib/repositories/platformFinanceRepository'

export async function GET() {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  return NextResponse.json(await listPlanPrices())
}

/** Takes { plan, price } — one price at a time, as the form submits them. */
export async function PATCH(request) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  const { plan, price } = await request.json().catch(() => ({}))
  const result = await setPlanPrice(plan, price)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result.prices)
}
