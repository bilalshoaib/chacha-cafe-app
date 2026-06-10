import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/session'
import * as usersRepo from '@/lib/repositories/usersRepository'

export async function GET() {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
  const list = await usersRepo.listPublicUsers()
  return NextResponse.json(list)
}

export async function POST(request) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
  const { email, password, role, displayName } = await request.json().catch(() => ({}))
  const result = await usersRepo.createManagedUser({
    email,
    password,
    role,
    displayName,
    createdBy: session.userId,
  })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result.user, { status: 201 })
}
