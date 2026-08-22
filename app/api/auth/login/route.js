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

  // A suspended café cannot sign in. Checked here rather than in middleware
  // because it must apply at the moment credentials are accepted, not merely
  // when a page is requested — and it is the same check for every route.
  if (user.tenantId) {
    const { isTenantActive } = await import('@/lib/repositories/tenantsRepository')
    if (!(await isTenantActive(user.tenantId))) {
      return NextResponse.json(
        { error: 'This account is currently suspended. Please contact support.' },
        { status: 403 },
      )
    }
  }

  const session = await getSession()
  session.userId = user.id
  session.email = user.email
  session.role = user.role
  // The tenant is resolved from the account, never from the request. A tenant
  // id the client could supply would be a tenant id the client could forge.
  session.tenantId = user.tenantId
  session.platformOwner = user.platformOwner
  await session.save()

  return NextResponse.json({ ok: true, user: usersRepo.toPublicUser(user) })
}
