import { NextResponse } from 'next/server'
import { requirePlatformOwner } from '@/lib/session'
import { setTenantLogo, clearTenantLogo, getTenant } from '@/lib/repositories/tenantsRepository'
import { recordAudit } from '@/lib/audit'

/**
 * Uploading and removing a café's logo.
 *
 * JSON with base64 rather than multipart, because every other request in this
 * app is JSON and the browser side is three lines of FileReader either way.
 * The size and type limits live in the repository, so the same rules apply to
 * a logo set at creation as to one replaced later.
 */
export async function POST(request, { params }) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const result = await setTenantLogo(id, { mime: body?.mime, data: body?.data })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  await recordAudit({
    actorId: owner.userId, actorEmail: owner.email,
    tenantId: id, tenantName: result.tenant?.name,
    action: 'branding_changed', detail: 'Uploaded a new logo',
  })
  return NextResponse.json(result.tenant)
}

export async function DELETE(_request, { params }) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })

  const { id } = await params
  if (!(await getTenant(id))) return NextResponse.json({ error: 'Café not found.' }, { status: 404 })
  const result = await clearTenantLogo(id)

  await recordAudit({
    actorId: owner.userId, actorEmail: owner.email,
    tenantId: id, tenantName: result.tenant?.name,
    action: 'branding_changed', detail: 'Removed the logo',
  })
  return NextResponse.json(result.tenant)
}
