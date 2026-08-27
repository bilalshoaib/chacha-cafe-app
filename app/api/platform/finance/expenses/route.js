import { NextResponse } from 'next/server'
import { requirePlatformOwner } from '@/lib/session'
import { listExpenses, recordExpense } from '@/lib/repositories/platformFinanceRepository'

export async function GET(request) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  const q = new URL(request.url).searchParams
  return NextResponse.json(await listExpenses({ from: q.get('from'), to: q.get('to') }))
}

export async function POST(request) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  const result = await recordExpense(await request.json().catch(() => ({})), owner.userId)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result.expense, { status: 201 })
}
