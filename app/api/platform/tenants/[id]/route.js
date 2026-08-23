import { NextResponse } from 'next/server'
import { requirePlatformOwner } from '@/lib/session'
import { getTenant, updateTenant, getTenantOwner } from '@/lib/repositories/tenantsRepository'
import { listAuditForTenant } from '@/lib/audit'

export async function GET(_request, { params }) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  const { id } = await params
  const tenant = await getTenant(id)
  if (!tenant) return NextResponse.json({ error: 'Café not found.' }, { status: 404 })
  // The trail travels with the café: what was done to it belongs beside what
  // it is, not on a separate screen nobody thinks to open.
  return NextResponse.json({
    ...tenant,
    ownerEmail: await getTenantOwner(id),
    audit: await listAuditForTenant(id),
  })
}

export async function PATCH(request, { params }) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const result = await updateTenant(id, body)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result.tenant)
}
