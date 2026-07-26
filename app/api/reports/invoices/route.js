import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/session'
import { getInvoicesInRange } from '@/lib/repositories/invoicesRepository'
import {
  calcInvoiceSplits,
  invoiceBusinessType,
  matchesBusiness,
  matchesPayment,
  parseReportFilters,
  parseReportRange,
  roundMoney,
} from '@/lib/reports'

function parsePageParam(raw, fallback) {
  const n = parseInt(String(raw ?? ''), 10)
  return Number.isFinite(n) && n >= 1 ? n : fallback
}

function parsePageSizeParam(raw, fallback = 25) {
  const n = parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(200, n)
}

/** Invoice rows for the reports Invoices tab. Line detail is omitted — the
 *  top-sellers endpoint owns that, so this response stays small. */
export async function GET(request) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Super admin only' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const range = parseReportRange(searchParams)
  if (range.error) return NextResponse.json({ error: range.error }, { status: range.status })
  const { from, to } = range
  const { business, payment } = parseReportFilters(searchParams)

  const inRange = await getInvoicesInRange(from.toISOString(), to.toISOString())

  const rows = []
  for (const inv of inRange) {
    const businessType = invoiceBusinessType(inv)
    if (!matchesBusiness(businessType, business)) continue
    if (!matchesPayment(inv.paymentMethod ?? null, payment)) continue
    const { cafePortion, burgerPortion } = calcInvoiceSplits(inv, businessType)
    rows.push({
      id: inv.id,
      orderId: inv.orderId,
      businessType,
      orderType: inv.orderType ?? null,
      createdAt: inv.createdAt,
      total: roundMoney(inv.total ?? 0),
      deliveryCharge: roundMoney(inv.deliveryCharge ?? 0),
      cafePortion,
      burgerPortion,
      paid: Boolean(inv.paid),
      returned: Boolean(inv.returned),
      paymentMethod: inv.paymentMethod ?? null,
    })
  }

  const total = rows.length
  const pageSize = parsePageSizeParam(searchParams.get('pageSize'))
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
  let page = parsePageParam(searchParams.get('page'), 1)
  if (page > totalPages) page = totalPages
  const start = (page - 1) * pageSize

  return NextResponse.json({
    from: from.toISOString(), to: to.toISOString(),
    invoices: rows.slice(start, start + pageSize),
    pagination: { page, pageSize, total, totalPages },
  })
}
