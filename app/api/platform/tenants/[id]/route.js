import { NextResponse } from 'next/server'
import { requirePlatformOwner } from '@/lib/session'
import { getTenant, updateTenant } from '@/lib/repositories/tenantsRepository'

export async function GET(_request, { params }) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  const { id } = await params
  const tenant = await getTenant(id)
  if (!tenant) return NextResponse.json({ error: 'Café not found.' }, { status: 404 })
  return NextResponse.json(tenant)
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
