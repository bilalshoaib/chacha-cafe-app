import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { findExpenses, saveExpenses } from '@/lib/repositories/expensesRepository'
import { normalizeBusinessType } from '@/lib/businessTypes'
import { randomUUID } from 'crypto'

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100
}

function forbidCashier(session) {
  return session.role === 'counter_cashier'
    ? NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    : null
}

export async function GET(request) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = forbidCashier(session)
  if (denied) return denied

  const { searchParams } = new URL(request.url)

  const fromRaw = searchParams.get('from')
  const toRaw = searchParams.get('to')
  const from = fromRaw ? new Date(fromRaw) : null
  const to = toRaw ? new Date(toRaw) : null
  if (fromRaw && Number.isNaN(from.getTime())) return NextResponse.json({ error: 'Invalid from date.' }, { status: 400 })
  if (toRaw && Number.isNaN(to.getTime())) return NextResponse.json({ error: 'Invalid to date.' }, { status: 400 })

  const list = await findExpenses({
    from: from ? from.toISOString() : null,
    to: to ? to.toISOString() : null,
    businessType: normalizeBusinessType(searchParams.get('businessType')),
  })

  const total = roundMoney(list.reduce((s, e) => s + Number(e.amount || 0), 0))
  return NextResponse.json({ expenses: list, total })
}

export async function POST(request) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = forbidCashier(session)
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const titleTrim = String(body.title ?? '').trim()
  if (!titleTrim) return NextResponse.json({ error: 'Title is required.' }, { status: 400 })

  const amt = Number(body.amount)
  if (!Number.isFinite(amt) || amt <= 0) return NextResponse.json({ error: 'Amount must be a positive number.' }, { status: 400 })

  const spentAt = body.spentAt == null || body.spentAt === '' ? new Date() : new Date(body.spentAt)
  if (Number.isNaN(spentAt.getTime())) return NextResponse.json({ error: 'Invalid spent date.' }, { status: 400 })

  const bt = normalizeBusinessType(body.businessType)
  if (!bt) return NextResponse.json({ error: 'businessType must be cafe or burger.' }, { status: 400 })

  const expense = {
    id: `e-${randomUUID().slice(0, 8)}`,
    title: titleTrim.slice(0, 200),
    amount: roundMoney(amt),
    category: String(body.category ?? 'other').trim().slice(0, 60) || 'other',
    businessType: bt,
    note: String(body.note ?? '').trim().slice(0, 500),
    spentAt: spentAt.toISOString(),
    createdAt: new Date().toISOString(),
  }

  await saveExpenses([expense])
  return NextResponse.json(expense, { status: 201 })
}
