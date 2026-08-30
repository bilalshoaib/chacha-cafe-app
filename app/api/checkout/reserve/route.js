import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/session'
import { reserveInvoiceNumbers, reserveShiftNumbers } from '@/lib/repositories/invoicesRepository'
import { getTenantDayHours } from '@/lib/repositories/tenantsRepository'
import { shiftDateForInstant } from '@/lib/shift'

const INVOICE_SEQUENCE = 'combined'

// Enough to cover a wifi outage through a lunch rush without handing out so
// many that a café which never goes offline burns through its numbering. A
// till tops the block up whenever it runs low, so this is a refill size rather
// than a ceiling on how long it can stay offline.
const DEFAULT_BLOCK = 50
const MAX_BLOCK = 200

/**
 * Hands a till a block of invoice and order numbers to spend while it cannot
 * reach the server.
 *
 * Both counters live in the database and both are consumed by asking for the
 * next value, which is exactly what a disconnected till cannot do. So it asks
 * in advance, and spends the block locally. The numbers on an offline
 * receipt are therefore real and final — nothing is renumbered when the sale
 * eventually syncs, and the paper the customer walked out with names the
 * invoice that ends up in the table.
 *
 * The shift date is resolved here rather than on the client, because it is the
 * date the order numbers were reserved *against*. A till that keeps selling
 * past the hour the café's day rolls over will find its local shift date has
 * moved on from this one; those sales take an invoice number from the block
 * and no order number, and /api/checkout/sync assigns one when they land.
 */
export async function POST(request) {
  const ctx = await requireTenant()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const requested = Number(body.count)
  const count = Number.isFinite(requested)
    ? Math.min(MAX_BLOCK, Math.max(1, Math.floor(requested)))
    : DEFAULT_BLOCK

  const { startHour, timezone } = await getTenantDayHours(ctx.tenantId)
  const shiftDate = shiftDateForInstant(new Date(), { shiftStartHour: startHour, timezone })

  const [invoiceNumbers, shiftNumbers] = await Promise.all([
    reserveInvoiceNumbers(INVOICE_SEQUENCE, count),
    reserveShiftNumbers(ctx, shiftDate, count),
  ])

  return NextResponse.json({
    shiftDate,
    // The hour and the zone are handed over together so the till can work out
    // for itself when the café's day has rolled past the one these numbers
    // belong to. Both, because an hour on the wrong clock answers it wrongly —
    // and a till disagreeing with the server about which day it is would queue
    // sales against a shift the server then files them under differently.
    dayStartHour: startHour,
    timezone,
    numbers: invoiceNumbers.map((invoiceNumber, i) => ({
      invoiceNumber,
      shiftNumber: shiftNumbers[i],
    })),
  })
}
