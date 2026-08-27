import { NextResponse } from 'next/server'
import { requireTenantSuperAdmin } from '@/lib/session'
import * as usersRepo from '@/lib/repositories/usersRepository'

export async function GET() {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
  const list = await usersRepo.listPublicUsers(ctx)
  return NextResponse.json(list)
}

export async function POST(request) {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
  const { email, password, role, displayName } = await request.json().catch(() => ({}))
  const result = await usersRepo.createManagedUser(ctx, {
    email,
    password,
    role,
    displayName,
    createdBy: ctx.userId,
  })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result.user, { status: 201 })
}
