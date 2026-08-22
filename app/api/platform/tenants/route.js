import { NextResponse } from 'next/server'
import { requirePlatformOwner } from '@/lib/session'
import { listTenants, createTenant } from '@/lib/repositories/tenantsRepository'

export async function GET() {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  return NextResponse.json({ tenants: await listTenants() })
}

export async function POST(request) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const result = await createTenant({ ...body, createdBy: owner.userId })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  // The temporary password is in this response and nowhere else — what is
  // stored is a hash. If the platform owner loses it, the café resets rather
  // than retrieves.
  return NextResponse.json(result, { status: 201 })
}
