import { NextResponse } from 'next/server'
import { requirePartnerAccess } from '@/lib/session'
import { createPartnerLogin, getPartner, listPartnerLogins } from '@/lib/repositories/partnersRepository'
import { recordAudit } from '@/lib/audit'

/**
 * The logins a partner kitchen signs in with. Created and removed by the
 * café's owner only — a partner adding its own accounts would be the café
 * handing out access to its till without knowing to whom.
 */
async function ownerFor(id) {
  const ctx = await requirePartnerAccess(id, { ownerOnly: true })
  return ctx?.asCafe ? ctx : null
}

export async function GET(_request, { params }) {
  const { id } = await params
  const ctx = await ownerFor(id)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await getPartner(ctx, id))) return NextResponse.json({ error: 'Partner kitchen not found.' }, { status: 404 })
  return NextResponse.json({ logins: await listPartnerLogins(ctx, id) })
}

export async function POST(request, { params }) {
  const { id } = await params
  const ctx = await ownerFor(id)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const partner = await getPartner(ctx, id)
  if (!partner) return NextResponse.json({ error: 'Partner kitchen not found.' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const result = await createPartnerLogin(ctx, id, { ...body, createdBy: ctx.userId })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  await recordAudit({
    actorId: ctx.userId,
    actorEmail: ctx.actorEmail ?? null,
    tenantId: ctx.tenantId,
    action: 'tenant_updated',
    detail: `Added login ${result.login.email} for partner kitchen "${partner.name}"`,
  })
  return NextResponse.json({ login: result.login }, { status: 201 })
}
