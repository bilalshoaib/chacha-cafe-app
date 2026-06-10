import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import * as usersRepo from '@/lib/repositories/usersRepository'

export async function GET() {
  const session = await getSession()
  if (!session.userId) {
    return NextResponse.json({ authenticated: false, user: null })
  }
  const row = await usersRepo.getUserById(session.userId)
  if (!row) {
    await session.destroy()
    return NextResponse.json({ authenticated: false, user: null })
  }
  return NextResponse.json({ authenticated: true, user: usersRepo.toPublicUser(row) })
}

export async function PATCH(request) {
  const session = await getSession()
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const { email, displayName } = body
  if (email === undefined && displayName === undefined) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }
  const result = await usersRepo.updateMyProfile(session.userId, { email, displayName })
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ user: result.user })
}
