import { NextResponse } from 'next/server'
import { requirePlatformOwner } from '@/lib/session'
import { platformFinanceReport } from '@/lib/repositories/platformFinanceRepository'

/** Earned, spent and kept across every café, over a range. */
export async function GET(request) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  const q = new URL(request.url).searchParams
  return NextResponse.json(await platformFinanceReport({ from: q.get('from'), to: q.get('to') }))
}
