import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { getExpenses, saveExpenses, deleteExpenseById } from '@/lib/repositories/expensesRepository'
import { normalizeBusinessType } from '@/lib/businessTypes'

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100
}

export async function GET(_request, { params }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const expenses = await getExpenses()
  const row = expenses.find((e) => e.id === id)
  if (!row) return NextResponse.json({ error: 'Expense not found.' }, { status: 404 })
  return NextResponse.json(row)
}

export async function PATCH(request, { params }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const expenses = await getExpenses()
  const existing = expenses.find((e) => e.id === id)
  if (!existing) return NextResponse.json({ error: 'Expense not found.' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const next = { ...existing }

  if (body.title !== undefined) {
    const t = String(body.title ?? '').trim()
    if (!t) return NextResponse.json({ error: 'Title cannot be empty.' }, { status: 400 })
    next.title = t.slice(0, 200)
  }
  if (body.amount !== undefined) {
    const amt = Number(body.amount)
    if (!Number.isFinite(amt) || amt <= 0) return NextResponse.json({ error: 'Amount must be a positive number.' }, { status: 400 })
    next.amount = roundMoney(amt)
  }
  if (body.category !== undefined) next.category = String(body.category ?? 'other').trim().slice(0, 60) || 'other'
  if (body.note !== undefined) next.note = String(body.note ?? '').trim().slice(0, 500)
  if (body.spentAt !== undefined) {
    const d = new Date(body.spentAt)
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid spent date.' }, { status: 400 })
    next.spentAt = d.toISOString()
  }
  if (body.businessType !== undefined) {
    const bt = normalizeBusinessType(body.businessType)
    if (!bt) return NextResponse.json({ error: 'businessType must be cafe or burger.' }, { status: 400 })
    next.businessType = bt
  }

  await saveExpenses([next])
  return NextResponse.json(next)
}

export async function DELETE(_request, { params }) {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const deleted = await deleteExpenseById(id)
  if (!deleted) return NextResponse.json({ error: 'Expense not found.' }, { status: 404 })
  return new Response(null, { status: 204 })
}
