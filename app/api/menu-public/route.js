import { NextResponse } from 'next/server'
import { loadMenu } from '@/lib/repositories/menuRepository'
import { toPublicMenu } from '@/lib/publicMenu'
import { resolvePublicTenantId } from '@/lib/publicTenant'
import { requireTenant } from '@/lib/session'
import { getTenantBranding } from '@/lib/tenantBranding'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
}

// A menu resolved from the caller's own session is theirs alone. Sharing the
// public route's `s-maxage` for it would hand one café's menu to whoever asked
// next, so a session-resolved answer is never stored anywhere.
const sessionHeaders = {
  ...corsHeaders,
  'Cache-Control': 'private, no-store',
}

/**
 * The menu as a customer may see it — what things are called and what they
 * cost to buy. Everything describing what the business pays (item cost prices,
 * per-item prices inside a deal) is stripped by toPublicMenu(), because this
 * route is unauthenticated and world-readable via CORS.
 *
 * Which café's menu is a question with three answers, tried in order: the slug
 * asked for, the café of whoever is signed in, and — on an install with a
 * single café — that one. The middle answer is what stopped the app's own home
 * page saying "Menu not found" the moment a second café existed: staff open it
 * with no slug in the address, and before that fallback the single-tenant
 * shortcut was the only thing that had been answering them.
 *
 * The café's identity travels with the menu. A visitor reading
 * `/?tenant=solo-coffee` has no session, so the page rendering that menu has
 * no other way to learn whose menu it is — and without it the board was
 * headed with the product's own name, or worse, with whichever café happened
 * to be hard-coded into the markup. Everything returned here is already
 * public: it is the name over the door, the mark on the sign and the two
 * colours they are painted in.
 */
export async function GET(request) {
  const slug = new URL(request.url).searchParams.get('tenant')

  if (slug) {
    const tenantId = await resolvePublicTenantId(slug)
    if (!tenantId) return notFound()
    return NextResponse.json(await menuFor({ tenantId }), { headers: corsHeaders })
  }

  const ctx = await requireTenant()
  if (ctx) {
    return NextResponse.json(await menuFor(ctx), { headers: sessionHeaders })
  }

  const tenantId = await resolvePublicTenantId(null)
  if (!tenantId) return notFound()
  return NextResponse.json(await menuFor({ tenantId }), { headers: corsHeaders })
}

/**
 * The menu, plus the café it belongs to.
 *
 * Both queries go out at once: they are independent, and over a connection
 * outside the database's region running them in turn doubles the wait for a
 * page a customer is looking at.
 */
async function menuFor(ctx) {
  const [menu, branding] = await Promise.all([
    loadMenu(ctx),
    getTenantBranding(ctx.tenantId),
  ])
  return {
    ...toPublicMenu(menu),
    // Only what a customer may see. `receiptFooter` is deliberately absent:
    // it is printed on their receipt, not published to anyone who asks.
    branding: {
      name: branding.name,
      tagline: branding.tagline,
      logoUrl: branding.logoUrl,
      primary: branding.primary,
      secondary: branding.secondary,
    },
  }
}

function notFound() {
  return NextResponse.json(
    { error: 'Menu not found. Add ?tenant= followed by the café’s URL name.' },
    { status: 404, headers: corsHeaders },
  )
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}
