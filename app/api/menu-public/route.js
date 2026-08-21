import { NextResponse } from 'next/server'
import { loadMenu } from '@/lib/repositories/menuRepository'
import { toPublicMenu } from '@/lib/publicMenu'
import { resolvePublicTenantId } from '@/lib/publicTenant'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
}

/**
 * The menu as a customer may see it — what things are called and what they
 * cost to buy. Everything describing what the business pays (item cost prices,
 * per-item prices inside a deal) is stripped by toPublicMenu(), because this
 * route is unauthenticated and world-readable via CORS.
 */
export async function GET(request) {
  const slug = new URL(request.url).searchParams.get('tenant')
  const tenantId = await resolvePublicTenantId(slug)
  if (!tenantId) return NextResponse.json({ error: 'Menu not found.' }, { status: 404, headers: corsHeaders })

  const menu = await loadMenu({ tenantId })
  return NextResponse.json(toPublicMenu(menu), { headers: corsHeaders })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}
