import { NextResponse } from 'next/server'
import { requirePartnerAccess } from '@/lib/session'
import { deletePartnerItem, parsePartnerItem, updatePartnerItem } from '@/lib/repositories/partnersRepository'
import { recordAudit } from '@/lib/audit'

/** Edits or removes one of a partner kitchen's own items. See ../route.js. */
export async function PATCH(request, { params }) {
  const { id, itemId } = await params
  const ctx = await requirePartnerAccess(id, { ownerOnly: true })
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const parsed = parsePartnerItem(body, { partial: true })
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const item = await updatePartnerItem(ctx, id, itemId, parsed.fields)
  if (!item) return NextResponse.json({ error: 'That item is not here any more.' }, { status: 404 })
  await recordAudit({
    actorId: ctx.userId,
    actorEmail: ctx.actorEmail ?? null,
    tenantId: ctx.tenantId,
    action: 'tenant_updated',
    detail: `Updated partner item "${item.name}"`,
  })
  return NextResponse.json({ item })
}

export async function DELETE(_request, { params }) {
  const { id, itemId } = await params
  const ctx = await requirePartnerAccess(id, { ownerOnly: true })
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const removed = await deletePartnerItem(ctx, id, itemId)
  if (!removed) return NextResponse.json({ error: 'That item is not here any more.' }, { status: 404 })
  await recordAudit({
    actorId: ctx.userId,
    actorEmail: ctx.actorEmail ?? null,
    tenantId: ctx.tenantId,
    action: 'tenant_updated',
    detail: `Removed partner item ${itemId}`,
  })
  return NextResponse.json({ ok: true })
}
