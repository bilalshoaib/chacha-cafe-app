import { NextResponse } from 'next/server'
import { getSession, activeImpersonation } from '@/lib/session'
import * as usersRepo from '@/lib/repositories/usersRepository'

/**
 * Who is signed in.
 *
 * Looks the account up by id alone, with no tenant scoping, and deliberately
 * so. Two accounts would otherwise be unable to answer this question about
 * themselves: the platform owner, whose row has no tenant at all, and the same
 * owner mid-impersonation, whose session names a café that is not theirs. The
 * id comes from a cookie this application signed, so it is already the
 * authoritative answer to "who is this" — narrowing it by tenant adds no
 * safety and breaks both cases.
 */
export async function GET() {
  const session = await getSession()
  if (!session.userId) {
    return NextResponse.json({ authenticated: false, user: null })
  }
  const row = await usersRepo.getAccountById(session.userId)
  if (!row) {
    await session.destroy()
    return NextResponse.json({ authenticated: false, user: null })
  }
  // The café being acted as, if any. The account's own tenantId answers "who
  // do they belong to"; this answers "whose screens are they looking at", and
  // while impersonating those are different. Without it the shell would show
  // the platform's own navigation over a café's data.
  const impersonation = activeImpersonation(session)

  // Checked here as well as in requireTenant(), because this is the first call
  // the app makes on every load — and, every fifteen seconds after it, the
  // only call an idle till makes at all. Without it a café stopped for late
  // payment would render its whole shell before the first data request signed
  // them out, and a till nobody was touching would stay open until somebody
  // pressed something.
  // Skipped while impersonating: that session belongs to the platform owner.
  if (!impersonation && row.tenantId) {
    const { getTenantAccess } = await import('@/lib/repositories/tenantsRepository')
    const access = await getTenantAccess(row.tenantId)
    if (!access.allowed) {
      await session.destroy()
      // The message travels with the refusal so the browser can carry it to
      // the login screen. Being stopped mid-shift is the one sign-out that
      // needs explaining, and "suspended" alone does not tell a café that an
      // invoice is three weeks overdue.
      return NextResponse.json({
        authenticated: false,
        user: null,
        blocked: access.reason,
        blockedMessage: access.message,
      })
    }
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      ...usersRepo.toPublicUser(row),
      impersonating: Boolean(impersonation),
      effectiveTenantId: impersonation?.tenantId ?? row.tenantId ?? null,
    },
  })
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
  const result = await usersRepo.updateMyOwnProfile(session.userId, { email, displayName })
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ user: result.user })
}
