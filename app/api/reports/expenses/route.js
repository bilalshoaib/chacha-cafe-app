import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/session'
import { getExpenses } from '@/lib/repositories/expensesRepository'
import { parseReportFilters, parseReportRange, roundMoney } from '@/lib/reports'

/** Expense rows for the reports Expenses tab, filtered by date spent. */
export async function GET(request) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Super admin only' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const range = parseReportRange(searchParams)
  if (range.error) return NextResponse.json({ error: range.error }, { status: range.status })
  const { from, to } = range
  const { business } = parseReportFilters(searchParams)

  const fromMs = from.getTime()
  const toMs = to.getTime()
  const allExpenses = await getExpenses()

  let total = 0
  const rows = []
  for (const e of Array.isArray(allExpenses) ? allExpenses : []) {
    const t = new Date(e.spentAt || e.createdAt).getTime()
    if (Number.isNaN(t) || t < fromMs || t > toMs) continue
    const businessType = String(e.businessType ?? 'cafe')
    if (business && businessType !== business) continue
    const amount = roundMoney(e.amount ?? 0)
    total += amount
    rows.push({
      id: e.id,
      title: String(e.title ?? '').slice(0, 200),
      amount,
      category: String(e.category ?? 'other').slice(0, 60),
      businessType,
      spentAt: e.spentAt || e.createdAt,
      note: String(e.note ?? '').slice(0, 200),
    })
  }
  rows.sort((a, b) => new Date(b.spentAt) - new Date(a.spentAt))

  return NextResponse.json({
    from: from.toISOString(), to: to.toISOString(),
    expenses: rows,
    total: roundMoney(total),
  })
}
