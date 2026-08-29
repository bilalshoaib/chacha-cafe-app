import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/session'
import { getInvoiceById, saveInvoice, nextShiftNumber } from '@/lib/repositories/invoicesRepository'
import { validateOfflineInvoice } from '@/lib/offlineSale'

// A till that has been offline for a long service can have a lot queued. It
// drains in batches so one request cannot sit open long enough to time out
// halfway and leave the queue in an unknown state.
const MAX_BATCH = 50

/**
 * Takes the sales a till rang up while it was offline and writes them down.
 *
 * This is not a checkout. Each sale is finished — priced, taxed, numbered from
 * a reserved block and printed — so nothing here re-prices anything; see
 * lib/offlineSale.js for why re-pricing a sale that already happened is the
 * wrong thing to do. What happens here is a consistency check and an insert.
 *
 * Every sale is reported on individually. A queue is drained by a till that
 * has just come back and may go again at any moment, so it needs to know
 * exactly which entries are safely stored and can be dropped, and which have
 * to be kept and retried. A single all-or-nothing answer would make it choose
 * between losing sales and duplicating them.
 */
export async function POST(request) {
  const ctx = await requireTenant()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const sales = Array.isArray(body.sales) ? body.sales.slice(0, MAX_BATCH) : []
  if (!sales.length) return NextResponse.json({ results: [] })

  const results = []
  for (const raw of sales) {
    const localId = raw?.localId ?? raw?.id ?? null
    const { invoice, error } = validateOfflineInvoice(raw)

    // A sale that does not add up is not retried. Sending it again will fail
    // in exactly the same way, and a till that keeps it forever never empties
    // its queue — so it is rejected outright and the till drops it, with the
    // reason surfaced rather than swallowed.
    if (error) {
      console.warn(`[sync] rejected ${localId}: ${error}`)
      results.push({ localId, status: 'rejected', error })
      continue
    }

    try {
      // Idempotent by invoice number, which is the point of reserving them.
      // A till that syncs, loses the connection before it hears back, and
      // retries must not write the sale twice — and must not overwrite a
      // stored invoice that has since been edited or refunded, which is why
      // this skips rather than upserting.
      const existing = await getInvoiceById(ctx, invoice.id)
      if (existing) {
        results.push({ localId, status: 'stored', invoiceId: invoice.id, duplicate: true })
        continue
      }

      // Sold past the hour the café's day rolled over, so the order number
      // reserved against the old shift was left off. It gets one from the
      // shift it actually belongs to.
      const toSave = invoice.shiftNumber == null
        ? { ...invoice, shiftNumber: await nextShiftNumber(ctx, invoice.shiftDate) }
        : invoice

      await saveInvoice(ctx, toSave)
      results.push({ localId, status: 'stored', invoiceId: toSave.id })
    } catch (e) {
      // Kept, not dropped: this is a failure of the connection or the
      // database, not of the sale, and it will likely succeed next time.
      console.error(`[sync] failed ${localId}:`, e)
      results.push({ localId, status: 'retry', error: e.message })
    }
  }

  const stored = results.filter((r) => r.status === 'stored').length
  console.log(`[sync] ${stored}/${results.length} stored for tenant ${ctx.tenantId}`)
  return NextResponse.json({ results })
}
