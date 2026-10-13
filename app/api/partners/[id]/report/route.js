import { NextResponse } from 'next/server'
import { requirePartnerAccess } from '@/lib/session'
import { getInvoicesInRange } from '@/lib/repositories/invoicesRepository'
import { getPartner } from '@/lib/repositories/partnersRepository'
import { invoiceBusinessType, parseReportRange, roundMoney } from '@/lib/reports'
import { partnerSettlement } from '@/lib/partners'

/**
 * A partner kitchen's sales over a date range, and how they settle: what the
 * café keeps at its supply price, and what it owes the partner.
 *
 * The figure both businesses settle on, so both may read it — the café's owner
 * and the partner's own logins. Nobody else on the café's staff: the café's
 * reports are owner-only, and this is one of them.
 */
export async function GET(request, { params }) {
  const { id } = await params
  const ctx = await requirePartnerAccess(id, { ownerOnly: true })
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partner = await getPartner(ctx, id)
  if (!partner) return NextResponse.json({ error: 'Partner kitchen not found.' }, { status: 404 })

  const range = parseReportRange(new URL(request.url).searchParams)
  if (range.error) return NextResponse.json({ error: range.error }, { status: range.status })

  const all = await getInvoicesInRange(ctx, range.from.toISOString(), range.to.toISOString())
  // Only the partner's own sales ever leave this route — a partner login reads
  // it, and the café's other takings are none of its business.
  const mine = all.filter((inv) => inv.brandId === partner.id || invoiceBusinessType(inv) === partner.slug)

  return NextResponse.json({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    partner,
    settlement: partnerSettlement(mine),
    invoices: mine.map((inv) => ({
      id: inv.id,
      shiftNumber: inv.shiftNumber ?? null,
      createdAt: inv.createdAt,
      total: roundMoney(inv.total ?? 0),
      cafeShare: roundMoney((inv.lines ?? []).reduce((s, l) => s + (Number(l.supplyTotal) || 0), 0)),
      paid: Boolean(inv.paid),
      returned: Boolean(inv.returned),
    })),
  })
}
