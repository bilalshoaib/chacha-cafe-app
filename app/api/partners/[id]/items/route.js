import { NextResponse } from 'next/server'
import { requirePartnerAccess } from '@/lib/session'
import { createPartnerItem, getPartner, parsePartnerItem } from '@/lib/repositories/partnersRepository'
import { recordAudit } from '@/lib/audit'

/**
 * Adds an item of the partner kitchen's own — one the café does not supply,
 * so the partner keeps all of what it sells for (lib/partners.js).
 *
 * The same rule as its price list: its logins may, and of the café's users
 * only the owner.
 */
export async function POST(request, { params }) {
  const { id } = await params
  const ctx = await requirePartnerAccess(id, { ownerOnly: true })
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partner = await getPartner(ctx, id)
  if (!partner) return NextResponse.json({ error: 'Partner kitchen not found.' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = parsePartnerItem(body)
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const item = await createPartnerItem(ctx, id, parsed.fields)
  await recordAudit({
    actorId: ctx.userId,
    actorEmail: ctx.actorEmail ?? null,
    tenantId: ctx.tenantId,
    action: 'tenant_updated',
    detail: `Added "${item.name}" to ${partner.name}'s own items`,
  })
  return NextResponse.json({ item }, { status: 201 })
}
