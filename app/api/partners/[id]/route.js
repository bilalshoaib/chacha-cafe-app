import { NextResponse } from 'next/server'
import { requirePartnerAccess } from '@/lib/session'
import { loadMenu } from '@/lib/repositories/menuRepository'
import { updatePartner } from '@/lib/repositories/partnersRepository'
import { findPartner, parseSupplyDiscountPct, supplyUnitPrice } from '@/lib/partners'
import { recordAudit } from '@/lib/audit'

/**
 * One partner kitchen, with the whole of the café's item list priced for it —
 * what both its till and its price list are drawn from.
 *
 * Open to the café's own users and to the partner's logins. What it carries is
 * chosen for the second of those: the café's menu prices (the partner settles
 * against them, so they are no secret from it) but never a cost price, a deal,
 * or anything else from the café's books.
 */
export async function GET(_request, { params }) {
  const { id } = await params
  const ctx = await requirePartnerAccess(id)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const menu = await loadMenu(ctx)
  const partner = findPartner(menu, id)
  if (!partner) return NextResponse.json({ error: 'Partner kitchen not found.' }, { status: 404 })

  const own = new Map(partner.prices.map((p) => [p.itemId, p]))
  const items = menu.items.map((i) => {
    const row = own.get(i.id)
    return {
      id: i.id,
      name: i.name,
      category: i.category,
      ...(i.size ? { size: i.size } : {}),
      ...(i.flavour ? { flavour: i.flavour } : {}),
      menuPrice: i.price,
      supplyPrice: supplyUnitPrice(i.price, partner.supplyDiscountPct),
      // null when the partner does not sell it.
      price: row ? row.price : null,
      visible: row ? row.visible : false,
    }
  })

  return NextResponse.json({
    partner: { id: partner.id, name: partner.name, slug: partner.slug, supplyDiscountPct: partner.supplyDiscountPct },
    items,
    // Items the partner makes itself; the café is owed nothing for them.
    ownItems: partner.ownItems ?? [],
    categories: menu.categories,
    // The till shows the tax on the ticket before checkout, as the café's does.
    tax: menu.tax,
    // The café's owner may change prices and settings; a partner login may
    // change only its prices. Said here so the screen does not have to guess.
    canManage: ctx.asCafe ? ctx.role === 'super_admin' : true,
    isOwner: Boolean(ctx.asCafe && ctx.role === 'super_admin'),
  })
}

/** Renames the partner, changes its discount or its receipt lines. The café's owner only. */
export async function PATCH(request, { params }) {
  const { id } = await params
  const ctx = await requirePartnerAccess(id, { ownerOnly: true })
  if (!ctx || !ctx.asCafe) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const fields = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 80)
    if (!name) return NextResponse.json({ error: 'Give the partner a name.' }, { status: 400 })
    fields.name = name
  }
  if (body.supplyDiscountPct !== undefined) {
    const pct = parseSupplyDiscountPct(body.supplyDiscountPct)
    if (pct.error) return NextResponse.json({ error: pct.error }, { status: 400 })
    fields.supplyDiscountPct = pct.value
  }

  // The two lines its receipts print in place of the café's. Blank clears one.
  for (const [key, max] of [['receiptTagline', 160], ['receiptFooter', 200]]) {
    if (body[key] === undefined) continue
    fields[key] = String(body[key] ?? '').trim().slice(0, max) || null
  }

  const partner = await updatePartner(ctx, id, fields)
  if (!partner) return NextResponse.json({ error: 'Partner kitchen not found.' }, { status: 404 })
  await recordAudit({
    actorId: ctx.userId,
    actorEmail: ctx.actorEmail ?? null,
    tenantId: ctx.tenantId,
    action: 'tenant_updated',
    detail: `Updated partner kitchen "${partner.name}" (${partner.supplyDiscountPct}% off menu prices)`,
  })
  return NextResponse.json({ partner })
}
