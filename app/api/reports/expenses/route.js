import { NextResponse } from 'next/server'
import { requireTenantSuperAdmin } from '@/lib/session'
import { findExpenses } from '@/lib/repositories/expensesRepository'
import { parseReportFilters, parseReportRange, roundMoney } from '@/lib/reports'

/** Expense rows for the reports Expenses tab, filtered by date spent. */
export async function GET(request) {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Super admin only' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const range = parseReportRange(searchParams)
  if (range.error) return NextResponse.json({ error: range.error }, { status: range.status })
  const { from, to } = range
  const { business } = parseReportFilters(searchParams)

  // Date range and business are applied by the database; this loop only shapes
  // the rows it is given.
  const matching = await findExpenses(ctx, {
    from: from.toISOString(),
    to: to.toISOString(),
    businessType: business,
  })

  let total = 0
  const rows = []
  for (const e of matching) {
    const businessType = String(e.businessType ?? 'cafe')
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
  return NextResponse.json({
    from: from.toISOString(), to: to.toISOString(),
    expenses: rows,
    total: roundMoney(total),
  })
}
