import { NextResponse } from 'next/server'
import { requirePlatformOwner } from '@/lib/session'
import { getTenant, resetOwnerPassword } from '@/lib/repositories/tenantsRepository'
import { recordAudit } from '@/lib/audit'

/**
 * Issues a fresh password for a café's owner.
 *
 * A POST rather than a GET because it changes something: the existing password
 * cannot be read back — it is stored as a hash — so the only way to answer
 * "what is their password" is to set a new one. The café's own trail records
 * that it happened, since somebody signing in afterwards with a password they
 * were not expecting deserves an explanation.
 */
export async function POST(_request, { params }) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })

  const { id } = await params
  const tenant = await getTenant(id)
  if (!tenant) return NextResponse.json({ error: 'Café not found.' }, { status: 404 })

  const result = await resetOwnerPassword(id)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  await recordAudit({
    actorId: owner.userId,
    actorEmail: owner.email,
    tenantId: tenant.id,
    tenantName: tenant.name,
    action: 'owner.password_reset',
    detail: `Issued a new sign-in password for ${result.owner.email}`,
  })

  return NextResponse.json(result)
}
