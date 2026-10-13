import { NextResponse } from 'next/server'
import { requirePartnerAccess } from '@/lib/session'
import { getPartner, parsePartnerPrices, savePartnerPrices } from '@/lib/repositories/partnersRepository'
import { recordAudit } from '@/lib/audit'

/**
 * Replaces a partner kitchen's price list: which of the café's items it sells,
 * at what price, and which are hidden for now.
 *
 * The partner sets its own prices, so its logins may do this; of the café's
 * users, only the owner may.
 */
export async function PUT(request, { params }) {
  const { id } = await params
  const ctx = await requirePartnerAccess(id, { ownerOnly: true })
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partner = await getPartner(ctx, id)
  if (!partner) return NextResponse.json({ error: 'Partner kitchen not found.' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = parsePartnerPrices(body.prices)
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const result = await savePartnerPrices(ctx, id, parsed.rows)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })

  await recordAudit({
    actorId: ctx.userId,
    actorEmail: ctx.actorEmail ?? null,
    tenantId: ctx.tenantId,
    action: 'tenant_updated',
    detail: `Saved ${partner.name}'s price list (${result.saved} item${result.saved === 1 ? '' : 's'})`,
  })
  return NextResponse.json({ saved: result.saved })
}
