import { NextResponse } from 'next/server'
import { requirePlatformOwner } from '@/lib/session'
import { platformActivity } from '@/lib/repositories/tenantsRepository'

/** How much each café is being used. Aggregates only — never their rows. */
const WINDOWS = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }

export async function GET(request) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })

  const days = WINDOWS[new URL(request.url).searchParams.get('window')] ?? 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  return NextResponse.json({ days, ...(await platformActivity(since)) })
}
