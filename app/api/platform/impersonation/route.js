import { NextResponse } from 'next/server'
import { getSession, activeImpersonation } from '@/lib/session'

/**
 * Whether this session is currently acting as a café, for the banner.
 *
 * Its own endpoint rather than a field on /api/auth/me, because the banner has
 * to appear for the platform owner while every other part of the app carries
 * on believing it is simply signed in as that café — which is exactly the
 * point of impersonation.
 */
export async function GET() {
  const session = await getSession()
  const current = activeImpersonation(session)
  if (!current) return NextResponse.json({ impersonating: false })
  return NextResponse.json({
    impersonating: true,
    tenantName: current.tenantName,
    control: current.control,
    expiresAt: current.expiresAt,
  })
}
