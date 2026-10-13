import { NextResponse } from 'next/server'
import { requireTenantSuperAdmin } from '@/lib/session'
import { createPartner, getTenantSlug, listPartners } from '@/lib/repositories/partnersRepository'
import { parseSupplyDiscountPct } from '@/lib/partners'
import { recordAudit } from '@/lib/audit'

/**
 * The café's partner kitchens (lib/partners.js). Owner-only: setting one up
 * decides what another business owes the café.
 */
export async function GET() {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [partners, tenantSlug] = await Promise.all([listPartners(ctx), getTenantSlug(ctx)])
  // The slug travels so the settings page can show each partner the address
  // of its public menu (/api/menu-public/partners/<slug>?tenant=<tenantSlug>).
  return NextResponse.json({ partners, tenantSlug })
}

export async function POST(request) {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim().slice(0, 80)
  if (!name) return NextResponse.json({ error: 'Give the partner a name.' }, { status: 400 })
  const pct = parseSupplyDiscountPct(body.supplyDiscountPct)
  if (pct.error) return NextResponse.json({ error: pct.error }, { status: 400 })

  const partner = await createPartner(ctx, { name, supplyDiscountPct: pct.value })
  await recordAudit({
    actorId: ctx.userId,
    actorEmail: ctx.actorEmail ?? null,
    tenantId: ctx.tenantId,
    action: 'tenant_updated',
    detail: `Added partner kitchen "${partner.name}" at ${partner.supplyDiscountPct}% off menu prices`,
  })
  return NextResponse.json({ partner }, { status: 201 })
}
