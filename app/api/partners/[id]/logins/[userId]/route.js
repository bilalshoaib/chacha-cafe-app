import { NextResponse } from 'next/server'
import { requirePartnerAccess } from '@/lib/session'
import { deletePartnerLogin } from '@/lib/repositories/partnersRepository'
import { recordAudit } from '@/lib/audit'

/** Removes one of a partner kitchen's logins. The café's owner only. */
export async function DELETE(_request, { params }) {
  const { id, userId } = await params
  const ctx = await requirePartnerAccess(id, { ownerOnly: true })
  if (!ctx?.asCafe) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const removed = await deletePartnerLogin(ctx, id, userId)
  if (!removed) return NextResponse.json({ error: 'Login not found.' }, { status: 404 })
  await recordAudit({
    actorId: ctx.userId,
    actorEmail: ctx.actorEmail ?? null,
    tenantId: ctx.tenantId,
    action: 'tenant_updated',
    detail: `Removed a partner kitchen login (${userId})`,
  })
  return NextResponse.json({ ok: true })
}
