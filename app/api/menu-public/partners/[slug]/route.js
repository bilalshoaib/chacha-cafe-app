import { NextResponse } from 'next/server'
import { loadMenu } from '@/lib/repositories/menuRepository'
import { toPublicPartnerMenu } from '@/lib/publicMenu'
import { resolvePublicTenantId } from '@/lib/publicTenant'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
}

/**
 * A partner kitchen's menu for its own website (lib/partners.js):
 *
 *   GET /api/menu-public/partners/<partner-slug>?tenant=<café-slug>
 *
 * Unauthenticated and readable from any origin, like /api/menu-public, so what
 * leaves is built by toPublicPartnerMenu() field by field: the items the
 * partner sells now, at its prices, and nothing of the café's — not its menu
 * price, not its cost, not the discount it gives the partner.
 *
 * The café is named by slug, as on the café's own public menu, and may be left
 * off on an install with a single café. Cached for a minute at the edge, so a
 * price changed on the partner's price list reaches the website within that.
 */
export async function GET(request, { params }) {
  const { slug } = await params
  const tenantSlug = new URL(request.url).searchParams.get('tenant')

  const tenantId = await resolvePublicTenantId(tenantSlug)
  if (!tenantId) return notFound()

  const menu = await loadMenu({ tenantId })
  const partner = (menu.partners ?? []).find((p) => p.slug === String(slug).toLowerCase())
  if (!partner) return notFound()

  return NextResponse.json(toPublicPartnerMenu(menu, partner), { headers: corsHeaders })
}

function notFound() {
  return NextResponse.json(
    { error: 'Menu not found. Use /api/menu-public/partners/<partner>?tenant=<café>.' },
    { status: 404, headers: corsHeaders },
  )
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}
