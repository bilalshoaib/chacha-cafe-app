import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/session'
import { getInvoices } from '@/lib/repositories/invoicesRepository'
import { getExpenses } from '@/lib/repositories/expensesRepository'
import { normalizeBusinessType } from '@/lib/businessTypes'

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100
}

function invoiceBusinessType(inv) {
  const explicit = normalizeBusinessType(inv?.businessType)
  if (explicit) return explicit
  if (String(inv?.id ?? '').startsWith('inv-burger-')) return 'burger'
  return 'cafe'
}

function calcInvoiceSplits(inv, invBt) {
  const lines = Array.isArray(inv.lines) ? inv.lines : []
  let cafeAmt = 0
  let burgerAmt = 0
  for (const line of lines) {
    const lt = roundMoney(line.lineTotal ?? 0)
    const lineCafe = roundMoney((line.cafeSplit ?? 0) * (line.qty ?? 1))
    const lineBurger = roundMoney((line.burgerSplit ?? 0) * (line.qty ?? 1))
    const splitsValid = line.isCombined && (lineCafe + lineBurger) > 0
    if (splitsValid) {
      cafeAmt += lineCafe
      burgerAmt += lineBurger
    } else {
      if (invBt === 'burger') burgerAmt += lt
      else cafeAmt += lt
    }
  }
  if (lines.length === 0) {
    if (invBt === 'burger') burgerAmt = roundMoney(inv.total ?? 0)
    else cafeAmt = roundMoney(inv.total ?? 0)
  }
  return { cafePortion: roundMoney(cafeAmt), burgerPortion: roundMoney(burgerAmt) }
}

export async function GET(request) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Super admin only' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const fromRaw = searchParams.get('from')
  const toRaw = searchParams.get('to')
  if (!fromRaw || !toRaw) return NextResponse.json({ error: 'Query params from and to are required.' }, { status: 400 })
  const from = new Date(fromRaw)
  const to = new Date(toRaw)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return NextResponse.json({ error: 'Invalid from or to date.' }, { status: 400 })
  if (from.getTime() > to.getTime()) return NextResponse.json({ error: 'from must be before or equal to to.' }, { status: 400 })

  const invoices = await getInvoices()
  const list = Array.isArray(invoices) ? invoices : []
  const fromMs = from.getTime()
  const toMs = to.getTime()
  const inRange = list.filter((inv) => {
    const t = new Date(inv.createdAt).getTime()
    return !Number.isNaN(t) && t >= fromMs && t <= toMs
  })

  let grossTotal = 0, returnedCount = 0, returnedTotal = 0, netSalesTotal = 0
  let paidCount = 0, unpaidCount = 0, cafeNetSales = 0, burgerNetSales = 0
  let cafeInvoiceCount = 0, burgerInvoiceCount = 0

  const rows = inRange.map((inv) => {
    const total = roundMoney(inv.total ?? 0)
    const businessType = invoiceBusinessType(inv)
    const { cafePortion, burgerPortion } = calcInvoiceSplits(inv, businessType)
    grossTotal += total
    const ret = Boolean(inv.returned)
    if (ret) {
      returnedCount += 1; returnedTotal += total
    } else {
      netSalesTotal += total; cafeNetSales += cafePortion; burgerNetSales += burgerPortion
      if (businessType === 'burger') burgerInvoiceCount += 1
      else cafeInvoiceCount += 1
      if (inv.paid) paidCount += 1; else unpaidCount += 1
    }
    return { id: inv.id, orderId: inv.orderId, businessType, createdAt: inv.createdAt, total, cafePortion, burgerPortion, paid: Boolean(inv.paid), returned: ret, paymentMethod: inv.paymentMethod ?? null }
  })

  grossTotal = roundMoney(grossTotal); returnedTotal = roundMoney(returnedTotal)
  netSalesTotal = roundMoney(netSalesTotal); cafeNetSales = roundMoney(cafeNetSales); burgerNetSales = roundMoney(burgerNetSales)
  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const allExpenses = await getExpenses()
  const expensesInRange = (Array.isArray(allExpenses) ? allExpenses : []).filter((e) => {
    const t = new Date(e.spentAt || e.createdAt).getTime()
    return !Number.isNaN(t) && t >= fromMs && t <= toMs
  })
  let expensesTotal = 0
  const expenseRows = expensesInRange.map((e) => {
    const amount = roundMoney(e.amount ?? 0)
    expensesTotal += amount
    return { id: e.id, title: String(e.title ?? '').slice(0, 200), amount, category: String(e.category ?? 'other').slice(0, 60), businessType: String(e.businessType ?? 'cafe'), spentAt: e.spentAt || e.createdAt, note: String(e.note ?? '').slice(0, 200) }
  })
  expensesTotal = roundMoney(expensesTotal)
  expenseRows.sort((a, b) => new Date(b.spentAt) - new Date(a.spentAt))

  return NextResponse.json({
    from: from.toISOString(), to: to.toISOString(),
    summary: { invoiceCount: inRange.length, grossTotal, returnedCount, returnedTotal, netSalesTotal, cafeNetSales, burgerNetSales, cafeInvoiceCount, burgerInvoiceCount, paidCount, unpaidCount, expenseCount: expensesInRange.length, expensesTotal, netAfterExpenses: roundMoney(netSalesTotal - expensesTotal) },
    invoices: rows, expenses: expenseRows,
  })
}
