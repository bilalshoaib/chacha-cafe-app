import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/session'
import { getInvoicesInRange } from '@/lib/repositories/invoicesRepository'
import { getExpenses } from '@/lib/repositories/expensesRepository'
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
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Super admin only' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const range = parseReportRange(searchParams)
  if (range.error) return NextResponse.json({ error: range.error }, { status: range.status })
  const { from, to } = range
  const { business, payment } = parseReportFilters(searchParams)

  const inRange = await getInvoicesInRange(from.toISOString(), to.toISOString())

  let grossTotal = 0, returnedCount = 0, returnedTotal = 0
  let paidCount = 0, unpaidCount = 0, cafeNetSales = 0, burgerNetSales = 0
  let cafeInvoiceCount = 0, burgerInvoiceCount = 0
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
    const { cafePortion, burgerPortion } = calcInvoiceSplits(inv, businessType)
    cafeNetSales += cafePortion; burgerNetSales += burgerPortion
    if (businessType === 'burger') burgerInvoiceCount += 1
    else if (businessType === 'cafe') cafeInvoiceCount += 1
    else { cafeInvoiceCount += 1; burgerInvoiceCount += 1 } // combined: counted in both
    if (inv.paid) paidCount += 1; else unpaidCount += 1
    if (deliveryCharge > 0) { deliveryChargesTotal += deliveryCharge; deliveryOrderCount += 1 }
  }

  cafeNetSales = roundMoney(cafeNetSales); burgerNetSales = roundMoney(burgerNetSales)
  const netSalesTotal = business === 'cafe' ? cafeNetSales
    : business === 'burger' ? burgerNetSales
    : roundMoney(cafeNetSales + burgerNetSales)
  // Net sales is built from per-business item portions, which never include the
  // delivery charge — so it already excludes delivery.
  const netSalesExclDelivery = netSalesTotal

  const fromMs = from.getTime()
  const toMs = to.getTime()
  const allExpenses = await getExpenses()
  let expensesTotal = 0
  let expenseCount = 0
  for (const e of Array.isArray(allExpenses) ? allExpenses : []) {
    const t = new Date(e.spentAt || e.createdAt).getTime()
    if (Number.isNaN(t) || t < fromMs || t > toMs) continue
    if (business && (e.businessType ?? 'cafe') !== business) continue
    expensesTotal += roundMoney(e.amount ?? 0)
    expenseCount += 1
  }
  expensesTotal = roundMoney(expensesTotal)

  return NextResponse.json({
    from: from.toISOString(), to: to.toISOString(),
    summary: {
      invoiceCount,
      grossTotal: roundMoney(grossTotal),
      returnedCount, returnedTotal: roundMoney(returnedTotal),
      netSalesTotal, netSalesExclDelivery,
      cafeNetSales, burgerNetSales, cafeInvoiceCount, burgerInvoiceCount,
      paidCount, unpaidCount,
      deliveryChargesTotal: roundMoney(deliveryChargesTotal), deliveryOrderCount,
      expenseCount, expensesTotal,
      netAfterExpenses: roundMoney(netSalesExclDelivery - expensesTotal),
    },
  })
}
