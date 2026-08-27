import { getIronSession } from 'iron-session'
import { NextResponse } from 'next/server'
import { activeImpersonation } from './lib/impersonation.js'

const secret = process.env.SESSION_SECRET || 'cafe-dev-session-secret-change-me-at-least-32'

const sessionOptions = {
  password: secret.length >= 32 ? secret : secret.padEnd(32, '_'),
  cookieName: 'cafe.sid',
  cookieOptions: { secure: process.env.NODE_ENV === 'production' },
}

/**
 * Paths that are accessible without being logged in.
 *
 * `/` is here for the café's public menu, but only half of it: a signed-out
 * visit to the bare address is turned away below. See the check in middleware()
 * for why the two cases differ.
 */
const PUBLIC_PATHS = ['/', '/login']

/**
 * The platform console. Guarded here only to keep the page from rendering for
 * the wrong person; the real check is requirePlatformOwner() in each route,
 * which reads the flag from the database rather than the cookie.
 */
function isPlatformPath(pathname) {
  return pathname === '/platform' || pathname.startsWith('/platform/')
}

/** Paths that require super_admin role. */
function isSuperAdminPath(pathname) {
  return pathname.startsWith('/settings/team') || pathname.startsWith('/settings/reports')
}

/** Paths that counter_cashier cannot access. */
function isExpensesPath(pathname) {
  return pathname.startsWith('/expenses')
}

export async function middleware(request) {
  const { pathname } = request.nextUrl

  // Skip static assets and Next.js internals. `/icon` covers the App Router's
  // generated /icon.svg — without it the favicon 307s to /login for anyone
  // not signed in, so the login page shows no icon.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icon') ||
    // Anything with a file extension is a file in public/ — the hero
    // photograph, the menu board's artwork. The matcher below does not exclude
    // them, so a signed-out visitor asking for /hero-bg.png was answered with
    // a 307 to /login and the public menu page rendered its hero over nothing.
    // No page route in this app has a dot in its path, so this cannot swallow
    // one.
    /\.[a-z0-9]+$/i.test(pathname)
  ) {
    return NextResponse.next()
  }

  const response = NextResponse.next()
  const session = await getIronSession(request, response, sessionOptions)

  const isPublic = PUBLIC_PATHS.includes(pathname)

  if (!isPublic && !session.userId) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // The bare address, signed out.
  //
  // `/` is public because it is the café's own menu, and the customer who
  // reads it arrives on a link that names the café — `/?tenant=solo-coffee`.
  // Somebody typing just the host is not that customer; they are staff opening
  // the app, and a menu board is not what they came for. So the menu stays
  // public on the link that asks for it, and the address on its own goes to
  // the login screen.
  if (
    pathname === '/' &&
    !session.userId &&
    !request.nextUrl.searchParams.has('tenant')
  ) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session.userId && isPlatformPath(pathname) && !session.platformOwner) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // A platform owner with no café open has nothing to see on a café's screens:
  // every query there needs a tenant, and without one they would get a string
  // of 401s that the client reads as a dead session. Send them to the café
  // list, where the way in is to open one. Opening a café sets
  // impersonatedTenantId, and from then on every page works normally.
  //
  // activeImpersonation() rather than a bare check for impersonatedTenantId:
  // the id stays on the cookie after the support session times out, so testing
  // only for its presence let an expired owner through to café screens that
  // requireTenant() then refused to give a tenant. AppShell renders that state
  // outside OrdersProvider, so the till threw rather than redirecting.
  if (
    session.userId &&
    session.platformOwner &&
    !session.tenantId &&
    !activeImpersonation(session) &&
    !isPlatformPath(pathname) &&
    !PUBLIC_PATHS.includes(pathname)
  ) {
    return NextResponse.redirect(new URL('/platform', request.url))
  }

  if (session.userId && isSuperAdminPath(pathname) && session.role !== 'super_admin') {
    return NextResponse.redirect(new URL('/settings', request.url))
  }

  if (session.userId && isExpensesPath(pathname) && session.role === 'counter_cashier') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image).*)'],
}
