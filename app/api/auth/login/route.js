import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import * as usersRepo from '@/lib/repositories/usersRepository'

export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  const email = usersRepo.normalizeEmail(body.email)
  const password = body.password

  if (!email || typeof password !== 'string') {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const user = await usersRepo.getUserByEmail(email)
  if (!user || !(await usersRepo.verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const session = await getSession()
  session.userId = user.id
  session.email = user.email
  session.role = user.role
  await session.save()

  return NextResponse.json({ ok: true, user: usersRepo.toPublicUser(user) })
}
