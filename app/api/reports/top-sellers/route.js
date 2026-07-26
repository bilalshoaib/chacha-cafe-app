import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/session'
import { getInvoicesInRange } from '@/lib/repositories/invoicesRepository'
import {
  invoiceBusinessType,
  matchesBusiness,
  matchesPayment,
  parseReportFilters,
  parseReportRange,
  roundMoney,
} from '@/lib/reports'

/** Ranks items and deals by units sold or revenue. Aggregation happens here so
 *  the response carries one row per product instead of every invoice's lines. */
export async function GET(request) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Super admin only' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const range = parseReportRange(searchParams)
  if (range.error) return NextResponse.json({ error: range.error }, { status: range.status })
  const { from, to } = range
  const { business, payment } = parseReportFilters(searchParams)
  const sort = searchParams.get('sort') === 'revenue' ? 'revenue' : 'qty'
  const limitRaw = parseInt(String(searchParams.get('limit') ?? ''), 10)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(200, limitRaw) : 50

  const inRange = await getInvoicesInRange(from.toISOString(), to.toISOString())

  const byKey = new Map()
  for (const inv of inRange) {
    if (inv.returned) continue
    const businessType = invoiceBusinessType(inv)
    if (!matchesBusiness(businessType, business)) continue
    if (!matchesPayment(inv.paymentMethod ?? null, payment)) continue
    for (const line of Array.isArray(inv.lines) ? inv.lines : []) {
      const extras = [line.size, line.flavour].filter(Boolean).join(' · ')
      const label = extras ? `${line.name} · ${extras}` : (line.name ?? '')
      const kind = line.kind ?? 'item'
      const key = `${kind}:${line.refId ?? label}`
      const qty = Number(line.qty) || 0
      const lineTotal = roundMoney(line.lineTotal ?? 0)
      const prev = byKey.get(key)
      if (prev) {
        prev.qty += qty
        prev.revenue += lineTotal
        prev.orderCount += 1
      } else {
        byKey.set(key, { key, label, kind, qty, revenue: lineTotal, orderCount: 1 })
      }
    }
  }

  const rows = [...byKey.values()]
    .map((r) => ({ ...r, revenue: roundMoney(r.revenue) }))
    .sort((a, b) => (sort === 'revenue' ? b.revenue - a.revenue : b.qty - a.qty))

  return NextResponse.json({
    from: from.toISOString(), to: to.toISOString(),
    sort,
    topSellers: rows.slice(0, limit),
    total: rows.length,
  })
}
