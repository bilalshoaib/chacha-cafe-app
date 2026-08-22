import { NextResponse } from 'next/server'
import { getSession, requirePlatformOwner, IMPERSONATION_MINUTES, activeImpersonation } from '@/lib/session'
import { getTenant } from '@/lib/repositories/tenantsRepository'
import { recordAudit } from '@/lib/audit'

/**
 * Opening, escalating and closing a support session on a café.
 *
 * Never a sign-in as the owner: the session keeps the platform owner's own
 * userId throughout, and carries the café alongside it. That is what lets the
 * audit trail always name the person who was actually at the keyboard.
 */

/** Open a support session, or take control of one already open. */
export async function POST(request, { params }) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })

  const { id } = await params
  const tenant = await getTenant(id)
  if (!tenant) return NextResponse.json({ error: 'Café not found.' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const takeControl = Boolean(body.control)

  const session = await getSession()
  session.impersonatedTenantId = tenant.id
  session.impersonatedTenantName = tenant.name
  session.impersonationControl = takeControl
  session.impersonationExpiresAt = Date.now() + IMPERSONATION_MINUTES * 60 * 1000
  await session.save()

  await recordAudit({
    actorId: owner.userId,
    actorEmail: owner.email,
    tenantId: tenant.id,
    tenantName: tenant.name,
    action: takeControl ? 'impersonation.control' : 'impersonation.start',
    detail: takeControl
      ? `Took control of ${tenant.name} — able to make changes`
      : `Opened ${tenant.name} read-only`,
  })

  return NextResponse.json({
    tenant: { id: tenant.id, name: tenant.name },
    control: takeControl,
    expiresAt: session.impersonationExpiresAt,
  })
}

/** Close it and go back to being yourself. */
export async function DELETE() {
  const session = await getSession()
  const current = activeImpersonation(session)

  delete session.impersonatedTenantId
  delete session.impersonatedTenantName
  delete session.impersonationControl
  delete session.impersonationExpiresAt
  await session.save()

  if (current && session.userId) {
    await recordAudit({
      actorId: session.userId,
      actorEmail: session.email,
      tenantId: current.tenantId,
      tenantName: current.tenantName,
      action: 'impersonation.end',
      detail: `Closed the support session on ${current.tenantName}`,
    })
  }
  return NextResponse.json({ ok: true })
}
