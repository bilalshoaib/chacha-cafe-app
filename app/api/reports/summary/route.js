import { NextResponse } from 'next/server'
import { requireReportReader } from '@/lib/session'
import { getInvoicesInRange } from '@/lib/repositories/invoicesRepository'
import { findExpenses } from '@/lib/repositories/expensesRepository'
import { listBrands } from '@/lib/repositories/menuRepository'
import { recordReportAccess } from '@/lib/audit'
import {
  calcInvoiceSplits,
  invoiceBusinessType,
  matchesBusiness,
  matchesPayment,
  parseReportFilters,
  parseReportRange,
  roundMoney,
} from '@/lib/reports'

/** Headline totals for the reports Summary tab. Reads no invoice line detail. */
export async function GET(request) {
  const ctx = await requireReportReader(request)
  if (!ctx) return NextResponse.json({ error: 'Super admin only' }, { status: 403 })

  // Only this route records the visit, of the four the reports screen calls.
  // It is the tab that opens first, so a sitting always passes through it, and
  // logging in all four would write the same entry four times for one look.
  if (ctx.fromConsole) {
    await recordReportAccess({
      actorId: ctx.userId,
      actorEmail: ctx.actorEmail,
      tenantId: ctx.tenantId,
      detail: 'Viewed this café’s sales and expense reports from the platform console',
    })
  }

  const { searchParams } = new URL(request.url)
  const range = parseReportRange(searchParams)
  if (range.error) return NextResponse.json({ error: range.error }, { status: range.status })
  const { from, to } = range
  const { business, payment } = parseReportFilters(searchParams)

  const inRange = await getInvoicesInRange(ctx, from.toISOString(), to.toISOString())

  // A column per brand the café actually has, rather than the two Chacha's
  // schema used to name. A single-brand café gets one, and the reports page
  // hides it because there is nothing to compare it against.
  const brands = await listBrands(ctx)
  const netByBrand = new Map(brands.map((b) => [b.slug, 0]))
  const countByBrand = new Map(brands.map((b) => [b.slug, 0]))

  let grossTotal = 0, returnedCount = 0, returnedTotal = 0
  let paidCount = 0, unpaidCount = 0
  let deliveryChargesTotal = 0, deliveryOrderCount = 0
  let invoiceCount = 0

  for (const inv of inRange) {
    if (!matchesPayment(inv.paymentMethod ?? null, payment)) continue
    const businessType = invoiceBusinessType(inv)
    // Every tile below is filtered the same way, so the headline numbers can
    // never disagree about which invoices they cover.
    if (!matchesBusiness(businessType, business)) continue
    invoiceCount += 1

    const total = roundMoney(inv.total ?? 0)
    const deliveryCharge = roundMoney(inv.deliveryCharge ?? 0)
    grossTotal += total
    if (inv.returned) {
      returnedCount += 1; returnedTotal += total
      continue
    }
    const portions = calcInvoiceSplits(inv, brands)
    for (const [slug, amount] of portions) {
      netByBrand.set(slug, roundMoney((netByBrand.get(slug) ?? 0) + amount))
      // An invoice counts towards a brand when it actually sold something for
      // it, which is what the old rule did by hand: a combined invoice was
      // counted under both, a single-business one under its own.
      if (amount > 0) countByBrand.set(slug, (countByBrand.get(slug) ?? 0) + 1)
    }
    if (inv.paid) paidCount += 1; else unpaidCount += 1
    if (deliveryCharge > 0) { deliveryChargesTotal += deliveryCharge; deliveryOrderCount += 1 }
  }

  const brandSummary = brands.map((b) => ({
    id: b.id, slug: b.slug, name: b.name,
    netSales: roundMoney(netByBrand.get(b.slug) ?? 0),
    invoiceCount: countByBrand.get(b.slug) ?? 0,
  }))

  const filtered = business ? brandSummary.filter((b) => b.slug === business) : brandSummary
  const netSalesTotal = roundMoney(filtered.reduce((sum, b) => sum + b.netSales, 0))
  // Net sales is built from per-business item portions, which never include the
  // delivery charge — so it already excludes delivery.
  const netSalesExclDelivery = netSalesTotal

  const matchingExpenses = await findExpenses(ctx, {
    from: from.toISOString(),
    to: to.toISOString(),
    businessType: business,
  })
  let expensesTotal = 0
  for (const e of matchingExpenses) expensesTotal += roundMoney(e.amount ?? 0)
  const expenseCount = matchingExpenses.length
  expensesTotal = roundMoney(expensesTotal)

  return NextResponse.json({
    from: from.toISOString(), to: to.toISOString(),
    summary: {
      invoiceCount,
      grossTotal: roundMoney(grossTotal),
      returnedCount, returnedTotal: roundMoney(returnedTotal),
      netSalesTotal, netSalesExclDelivery,
      brands: brandSummary,
      paidCount, unpaidCount,
      deliveryChargesTotal: roundMoney(deliveryChargesTotal), deliveryOrderCount,
      expenseCount, expensesTotal,
      netAfterExpenses: roundMoney(netSalesExclDelivery - expensesTotal),
    },
  })
}
