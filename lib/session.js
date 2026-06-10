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
