import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { loadMenu } from '@/lib/repositories/menuRepository'

/**
 * The full menu, including cost prices and in-deal item prices.
 *
 * This is staff-only data: `costPrice` is what an item costs the business and
 * `includes[].unitPrice` is what an item is worth inside a deal, so together
 * they expose the margin on every line. The unauthenticated menu lives at
 * /api/menu-public, which strips both.
 */
export async function GET() {
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const menu = await loadMenu()
  return NextResponse.json(menu)
}
