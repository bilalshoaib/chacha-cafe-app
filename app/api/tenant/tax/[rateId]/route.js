import { NextResponse } from 'next/server'
import { requireTenantSuperAdmin } from '@/lib/session'
import { deleteTaxRate, getTaxRate, updateTaxRate } from '@/lib/repositories/taxRepository'
import { recordAudit } from '@/lib/audit'
import { parseTaxRateInput } from '@/lib/tax'

/**
 * One rate: edited or removed.
 *
 * The PATCH is a merge rather than a replace — the settings screen sends only
 * the field that changed, and a rate whose categories vanished because the
 * body did not mention them would start being charged on the whole menu.
 */
export async function PATCH(request, { params }) {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { rateId } = await params

  const existing = await getTaxRate(ctx, rateId)
  if (!existing) return NextResponse.json({ error: 'Tax rate not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = parseTaxRateInput(body, existing)
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const rate = await updateTaxRate(ctx, rateId, parsed.rate)
  if (!rate) return NextResponse.json({ error: 'Tax rate not found' }, { status: 404 })

  await recordAudit({
    actorId: ctx.userId,
    actorEmail: ctx.actorEmail ?? null,
    tenantId: ctx.tenantId,
    action: 'tenant_updated',
    detail: `Changed sales tax "${rate.name}" to ${rate.rate}%${rate.enabled ? '' : ' (switched off)'}`,
  })
  return NextResponse.json({ rate })
}

export async function DELETE(_request, { params }) {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { rateId } = await params

  const existing = await getTaxRate(ctx, rateId)
  if (!existing) return NextResponse.json({ error: 'Tax rate not found' }, { status: 404 })

  await deleteTaxRate(ctx, rateId)
  await recordAudit({
    actorId: ctx.userId,
    actorEmail: ctx.actorEmail ?? null,
    tenantId: ctx.tenantId,
    action: 'tenant_updated',
    // Says what it was, because after this the row is gone and the entry is
    // the only record that the café ever charged it.
    detail: `Removed sales tax "${existing.name}" (${existing.rate}%)`,
  })
  return NextResponse.json({ ok: true })
}
