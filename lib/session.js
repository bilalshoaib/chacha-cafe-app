import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { activeImpersonation } from './impersonation.js'

const secret = process.env.SESSION_SECRET || 'cafe-dev-session-secret-change-me-at-least-32'

export const sessionOptions = {
  password: secret.length >= 32 ? secret : secret.padEnd(32, '_'),
  cookieName: 'cafe.sid',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
  },
}

/** Get session from the current request (App Router route handlers). */
export async function getSession() {
  const cookieStore = await cookies()
  return getIronSession(cookieStore, sessionOptions)
}

/** Returns session if authenticated, else null. */
export async function requireAuth() {
  const session = await getSession()
  if (!session.userId) return null
  return session
}

/** Returns session if super_admin, else null. */
export async function requireSuperAdmin() {
  const session = await getSession()
  if (!session.userId || session.role !== 'super_admin') return null
  return session
}

/** Reports are owner-only, and still need the tenant to scope their queries. */
export async function requireTenantSuperAdmin() {
  const ctx = await requireTenant()
  if (!ctx || ctx.role !== 'super_admin') return null
  return ctx
}

/**
 * Who may read a café's reports, and which café's.
 *
 * Two callers, one set of queries. Ordinarily it is the café's own owner
 * reading their own books, and `?tenantId=` is absent. When the platform owner
 * opens a café's reports from the console it is present, and this returns a
 * context for *that* café — so the report routes need no branch, and the
 * console shows exactly the figures the owner sees rather than a second
 * implementation of them that can disagree.
 *
 * Two things make that safe. The context is `readOnly`, which withTenant()
 * turns into a database role holding no INSERT, UPDATE or DELETE — so a report
 * route cannot be talked into writing whatever it is handed. And the tenant id
 * is still a tenant id: withTenant() refuses anything outside the shape it
 * issues, so a guessed or forged value reaches no query.
 *
 * Returns null for everyone else, including a café owner who tries passing
 * someone else's tenant id — being a super_admin of one café confers nothing
 * over another, and the platform-owner flag is read from the database rather
 * than the cookie.
 */
export async function requireReportReader(request) {
  const tenantId = new URL(request.url).searchParams.get('tenantId')
  if (!tenantId) return requireTenantSuperAdmin()

  const owner = await requirePlatformOwner()
  if (!owner) return null
  return {
    userId: owner.userId,
    actorEmail: owner.email,
    role: 'super_admin',
    tenantId,
    platformOwner: true,
    readOnly: true,
    // Distinguishes "the platform is looking" from "the café is looking",
    // which is what the audit trail records.
    fromConsole: true,
  }
}

/**
 * The authenticated caller together with the tenant their data lives in —
 * the object every repository call takes as its first argument.
 *
 * Returns null when there is no session, and also when a session carries no
 * tenant. The second case is the one worth being strict about: a cookie
 * issued before tenants existed has no tenantId, and treating that as
 * "no filter" rather than "not allowed" is exactly how one café ends up
 * reading another's takings.
 */
export async function requireTenant() {
  const session = await getSession()
  if (!session.userId) return null

  const impersonation = activeImpersonation(session)
  if (impersonation) {
    // No access check on this path, deliberately. A café stopped for late
    // payment is exactly the one support needs to be able to open — refusing
    // the platform owner entry to it would make the restriction unanswerable
    // by the person who applied it.
    // Every repository call takes this object, so returning the impersonated
    // café here is what makes the whole app show that café — with no query,
    // route or page needing to know impersonation exists.
    return {
      userId: session.userId,
      role: 'super_admin',
      tenantId: impersonation.tenantId,
      platformOwner: true,
      impersonating: true,
      // Read-only until control is deliberately taken. withTenant() turns this
      // into a database role that cannot write, rather than a flag routes are
      // trusted to check.
      readOnly: !impersonation.control,
      actorEmail: session.email,
    }
  }

  if (!session.tenantId) return null

  // The restriction gate, and the reason it is here rather than in middleware:
  // this is the one function every route that touches a café's data already
  // calls, and middleware runs on the edge where there is no database to ask.
  //
  // Sign-in used to be the only place a suspension was checked, which meant a
  // café stopped at 2pm carried on taking orders until its cookie expired — up
  // to seven days later. Ending the session here is what turns "cannot sign in
  // again" into "is signed out now": the route goes on to answer 401, and the
  // client's unauthorized handler drops them on the login screen, where the
  // login route tells them which of the three reasons it was.
  const { getTenantAccess } = await import('./repositories/tenantsRepository.js')
  const access = await getTenantAccess(session.tenantId)
  if (!access.allowed) {
    await session.destroy()
    return null
  }

  return {
    userId: session.userId,
    role: session.role,
    tenantId: session.tenantId,
    platformOwner: Boolean(session.platformOwner),
  }
}

// Both live in lib/impersonation.js so that middleware, which cannot import
// this module, asks the same question of a session that the app does.
// Re-exported here because every route already reaches for them through
// '@/lib/session'.
export { activeImpersonation, IMPERSONATION_MINUTES } from './impersonation.js'

/**
 * The platform owner — the account that runs the product itself, creates cafés
 * and supports them. Sits above every tenant and belongs to none, which is why
 * it is a flag on the user rather than a membership.
 *
 * Deliberately strict: the flag is checked against the database on every call
 * rather than trusted from the cookie, so revoking it takes effect at once
 * instead of whenever the session happens to expire.
 */
export async function requirePlatformOwner() {
  const session = await getSession()
  if (!session.userId) return null
  const { getPlatformOwnerById } = await import('./repositories/usersRepository.js')
  const owner = await getPlatformOwnerById(session.userId)
  if (!owner) return null
  return { userId: owner.id, email: owner.email, platformOwner: true }
}
