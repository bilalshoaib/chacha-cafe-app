import { NextResponse } from 'next/server'
import { requireTenantSuperAdmin } from '@/lib/session'
import {
  createTaxRate,
  getTaxConfig,
  setPricesIncludeTax,
} from '@/lib/repositories/taxRepository'
import { listCategories } from '@/lib/repositories/menuRepository'
import { recordAudit } from '@/lib/audit'
import { parseTaxRateInput, TAX_ORDER_TYPES } from '@/lib/tax'

/**
 * A café's sales tax: the rates it charges and whether its prices already
 * contain them.
 *
 * Owner-only, and the café's own — as against the console's tenant PATCH,
 * which can reach a billing plan and a currency and stays the platform
 * owner's. Tax is the café's to set because tax is charged by the café: the
 * rate is set by its state and county, and the platform cannot know it.
 *
 * Not staff. A cashier who can change the tax rate can undercharge every sale
 * for the rest of the shift, and the café is liable for the difference.
 */
export async function GET() {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [config, categories] = await Promise.all([getTaxConfig(ctx), listCategories(ctx)])
  // The café's own categories travel with the answer so the picker can only
  // offer keys that exist on this menu, and cannot drift from what the server
  // would accept.
  return NextResponse.json({
    ...config,
    categories: categories.map((c) => ({ key: c.key, label: c.label })),
    orderTypes: TAX_ORDER_TYPES,
  })
}

/** Switches the whole café between tax-inclusive and tax-exclusive pricing. */
export async function PATCH(request) {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (body.pricesIncludeTax === undefined) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  }

  const value = await setPricesIncludeTax(ctx, body.pricesIncludeTax)
  await recordAudit({
    actorId: ctx.userId,
    actorEmail: ctx.actorEmail ?? null,
    tenantId: ctx.tenantId,
    action: 'tenant_updated',
    detail: value
      ? 'Set menu prices to include tax'
      : 'Set tax to be added on top of menu prices',
  })
  return NextResponse.json({ pricesIncludeTax: value })
}

/** Adds a rate. */
export async function POST(request) {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const parsed = parseTaxRateInput(body)
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const rate = await createTaxRate(ctx, parsed.rate)
  await recordAudit({
    actorId: ctx.userId,
    actorEmail: ctx.actorEmail ?? null,
    tenantId: ctx.tenantId,
    action: 'tenant_updated',
    detail: `Added sales tax "${rate.name}" at ${rate.rate}%`,
  })
  return NextResponse.json({ rate }, { status: 201 })
}
