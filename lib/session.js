import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'

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
  return {
    userId: session.userId,
    role: session.role,
    tenantId: session.tenantId,
    platformOwner: Boolean(session.platformOwner),
  }
}

/**
 * The impersonation on this session, if there is one that has not run out.
 *
 * Support sessions expire on their own. Left open they become a standing
 * ability to read a customer's books that nobody remembers granting, and the
 * likeliest way that happens is a tab left open rather than anything
 * deliberate.
 */
export function activeImpersonation(session) {
  if (!session?.impersonatedTenantId || !session?.platformOwner) return null
  if (!session.impersonationExpiresAt || Date.now() > session.impersonationExpiresAt) return null
  return {
    tenantId: session.impersonatedTenantId,
    tenantName: session.impersonatedTenantName,
    control: Boolean(session.impersonationControl),
    expiresAt: session.impersonationExpiresAt,
  }
}

/** How long a support session lasts before it drops back on its own. */
export const IMPERSONATION_MINUTES = 30

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
