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
  if (!session.userId || !session.tenantId) return null
  return {
    userId: session.userId,
    role: session.role,
    tenantId: session.tenantId,
    platformOwner: Boolean(session.platformOwner),
  }
}
