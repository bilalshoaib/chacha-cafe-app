import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/session'
import { getInvoicesInRange } from '@/lib/repositories/invoicesRepository'
import { loadMenu } from '@/lib/repositories/menuRepository'
import {
  allocateDealLineRevenue,
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

  const [inRange, menu] = await Promise.all([
    getInvoicesInRange(from.toISOString(), to.toISOString()),
    loadMenu(),
  ])

  // Deal lines only store item ids, so resolve display names from the menu.
  const menuLabelById = new Map()
  const menuPriceById = new Map()
  for (const item of menu.items ?? []) {
    const extras = [item.size, item.flavour].filter(Boolean).join(' · ')
    menuLabelById.set(item.id, extras ? `${item.name} · ${extras}` : item.name)
    menuPriceById.set(item.id, Number(item.price) || 0)
  }

  const byKey = new Map()
  // Per-item tally that splits standalone sales from units bundled inside deals.
  const itemStats = new Map()
  function itemEntry(refId, label) {
    const key = refId ?? label
    let entry = itemStats.get(key)
    if (!entry) {
      entry = {
        refId: key,
        label,
        standaloneQty: 0,
        standaloneRevenue: 0,
        inDealQty: 0,
        inDealRevenue: 0,
        deals: new Map(),
      }
      itemStats.set(key, entry)
    }
    if (!entry.label) entry.label = label
    return entry
  }

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

      if (kind === 'deal') {
        // One deal line of qty N contributes N × (units per deal) of each
        // included item, and a proportional share of what the line earned.
        for (const part of allocateDealLineRevenue(line, menuPriceById)) {
          const entry = itemEntry(part.itemId, menuLabelById.get(part.itemId) || part.itemId)
          entry.inDealQty += part.units
          entry.inDealRevenue += part.revenue
          const prev = entry.deals.get(label) ?? { qty: 0, revenue: 0 }
          entry.deals.set(label, { qty: prev.qty + part.units, revenue: prev.revenue + part.revenue })
        }
      } else {
        const entry = itemEntry(line.refId, label)
        entry.standaloneQty += qty
        entry.standaloneRevenue += lineTotal
      }
    }
  }

  const rows = [...byKey.values()]
    .map((r) => ({ ...r, revenue: roundMoney(r.revenue) }))
    .sort((a, b) => (sort === 'revenue' ? b.revenue - a.revenue : b.qty - a.qty))

  const items = [...itemStats.values()]
    .map((e) => ({
      refId: e.refId,
      label: e.label,
      standaloneQty: e.standaloneQty,
      standaloneRevenue: roundMoney(e.standaloneRevenue),
      inDealQty: e.inDealQty,
      inDealRevenue: roundMoney(e.inDealRevenue),
      totalQty: e.standaloneQty + e.inDealQty,
      totalRevenue: roundMoney(e.standaloneRevenue + e.inDealRevenue),
      deals: [...e.deals.entries()]
        .map(([dealLabel, v]) => ({ label: dealLabel, qty: v.qty, revenue: roundMoney(v.revenue) }))
        .sort((a, b) => b.qty - a.qty),
    }))
    .sort((a, b) => b.totalQty - a.totalQty)

  return NextResponse.json({
    from: from.toISOString(), to: to.toISOString(),
    sort,
    topSellers: rows.slice(0, limit),
    total: rows.length,
    items,
  })
}
