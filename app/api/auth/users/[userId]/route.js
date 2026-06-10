import { NextResponse } from 'next/server'
import { requireSuperAdmin, getSession } from '@/lib/session'
import * as usersRepo from '@/lib/repositories/usersRepository'

export async function GET(_request, { params }) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
  const { userId } = await params
  const row = await usersRepo.getUserById(userId)
  if (!row) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  return NextResponse.json(usersRepo.toPublicUser(row))
}

export async function PATCH(request, { params }) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
  const { userId } = await params
  const { email, displayName, role, newPassword } = await request.json().catch(() => ({}))
  const result = await usersRepo.updateManagedUser(userId, { email, displayName, role, newPassword })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ user: result.user })
}
