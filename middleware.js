import { getIronSession } from 'iron-session'
import { NextResponse } from 'next/server'

const secret = process.env.SESSION_SECRET || 'cafe-dev-session-secret-change-me-at-least-32'

const sessionOptions = {
  password: secret.length >= 32 ? secret : secret.padEnd(32, '_'),
  cookieName: 'cafe.sid',
  cookieOptions: { secure: process.env.NODE_ENV === 'production' },
}

/** Paths that are accessible without being logged in. */
const PUBLIC_PATHS = ['/', '/login']

/** Paths that require super_admin role. */
function isSuperAdminPath(pathname) {
  return pathname.startsWith('/settings/team') || pathname.startsWith('/settings/reports')
}

export async function middleware(request) {
  const { pathname } = request.nextUrl

  // Skip static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icons')
  ) {
    return NextResponse.next()
  }

  const response = NextResponse.next()
  const session = await getIronSession(request, response, sessionOptions)

  const isPublic = PUBLIC_PATHS.includes(pathname)

  if (!isPublic && !session.userId) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session.userId && isSuperAdminPath(pathname) && session.role !== 'super_admin') {
    return NextResponse.redirect(new URL('/settings', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image).*)'],
}
