import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import * as usersRepo from '@/lib/repositories/usersRepository'

export async function POST(request) {
  const session = await getSession()
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { currentPassword, newPassword } = await request.json().catch(() => ({}))
  const result = await usersRepo.changeMyPassword(session.userId, currentPassword, newPassword)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
