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
import { netOfTax } from '@/lib/tax'

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
  // Tax collected, and sales net of it. Kept apart from every other figure
  // here because it is not the café's money: it is collected on behalf of a
  // government and handed over, and the quarter is filed on this number.
  let taxCollectedTotal = 0, taxableSalesTotal = 0
  // How much of the tax collected is sitting inside net sales, and therefore
  // has to come back out of it. Only inclusive-priced sales contribute: under
  // exclusive pricing the tax was never in a line total to begin with.
  let inclusiveTaxInNetSales = 0

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
    taxCollectedTotal += roundMoney(inv.taxTotal ?? 0)
    taxableSalesTotal += netOfTax(inv)

    const portions = calcInvoiceSplits(inv, brands)

    if (inv.taxInclusive && (inv.taxTotal ?? 0) > 0) {
      const tax = roundMoney(inv.taxTotal)
      if (!business) {
        inclusiveTaxInNetSales += tax
      } else {
        // Net sales has been narrowed to one brand, so only that brand's share
        // of this sale's tax should come out of it. Split by the brand's share
        // of the sale — the same portions net sales itself was built from, so
        // the two cannot disagree about what belongs to whom.
        const whole = [...portions.values()].reduce((sum, v) => sum + v, 0)
        const share = portions.get(business) ?? 0
        inclusiveTaxInNetSales += whole > 0 ? roundMoney(tax * (share / whole)) : 0
      }
    }

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

  // Under tax-exclusive pricing the line totals never held the tax, so net
  // sales is already clean. Under inclusive pricing it is inside them, and
  // counting it as revenue overstates the café's takings by the rate.
  const netSalesExclTax = roundMoney(netSalesExclDelivery - inclusiveTaxInNetSales)

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
      taxCollectedTotal: roundMoney(taxCollectedTotal),
      taxableSalesTotal: roundMoney(taxableSalesTotal),
      netSalesExclTax,
      expenseCount, expensesTotal,
      // Expenses come off sales the business actually keeps, which is sales
      // with the tax taken out — tax collected was never the café's to spend.
      netAfterExpenses: roundMoney(netSalesExclTax - expensesTotal),
    },
  })
}
