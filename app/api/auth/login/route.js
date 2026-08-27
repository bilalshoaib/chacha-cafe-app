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

  // A café that is suspended, restricted for payment, or out of trial cannot
  // sign in. Checked after the password rather than before it, so the reason is
  // only ever told to somebody who has proved they belong to the café — the
  // state of a business's account is not something to leak to a stranger
  // guessing email addresses.
  //
  // requireTenant() runs the same rule on every request, which is what signs
  // out a session that is already open. This is the half that explains why.
  if (user.tenantId) {
    const { getTenantAccess } = await import('@/lib/repositories/tenantsRepository')
    const access = await getTenantAccess(user.tenantId)
    if (!access.allowed) {
      return NextResponse.json({ error: access.message, blocked: access.reason }, { status: 403 })
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
