import { NextResponse } from 'next/server'
import { requirePlatformOwner } from '@/lib/session'
import { getTenant, updateTenant, getTenantOwner } from '@/lib/repositories/tenantsRepository'
import { listAuditForTenant, recordAudit } from '@/lib/audit'
import { tradingDayLabel } from '@/lib/tradingDay'

export async function GET(_request, { params }) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  const { id } = await params
  const tenant = await getTenant(id)
  if (!tenant) return NextResponse.json({ error: 'Café not found.' }, { status: 404 })
  // The trail travels with the café: what was done to it belongs beside what
  // it is, not on a separate screen nobody thinks to open.
  return NextResponse.json({
    ...tenant,
    ownerEmail: await getTenantOwner(id),
    audit: await listAuditForTenant(id),
  })
}

/**
 * What each editable field is called when the change is written to the trail.
 * The café's owner reads that trail, so it says "the accent colour" and not
 * "brandSecondary".
 */
const FIELD_LABELS = {
  name: 'the name',
  slug: 'the URL name',
  plan: 'the plan',
  status: 'access',
  monthlyPrice: 'what they pay a month',
  trialDays: 'the trial length',
  trialEndsAt: 'the trial end date',
  dayStartHour: 'when their day opens',
  dayEndHour: 'when their day closes',
  restrictedReason: 'the reason access is paused',
  tagline: 'the tagline',
  brandPrimary: 'the main colour',
  brandSecondary: 'the accent colour',
  receiptFooter: 'the receipt footer',
  currency: 'the currency',
}

export async function PATCH(request, { params }) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const result = await updateTenant(id, body)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  // The console can now change a café's own identity, not merely govern it, so
  // the trail has to say what was touched. Suspending and reactivating are
  // called out by name because they are the two the owner will come asking
  // about; everything else is listed.
  const changed = Object.keys(body).filter((k) => k in FIELD_LABELS)
  if (changed.length) {
    // The café's owner reads this trail, so the entries that decide whether
    // they can work are named plainly rather than listed as "changed access".
    // The trading day gets a line of its own rather than "changed when their
    // day opens, when their day closes": it moves which day a sale counts
    // against, so the trail should say what it was set to.
    const dayChanged = body.dayStartHour !== undefined || body.dayEndHour !== undefined
    const detail = dayChanged && changed.every((k) => k === 'dayStartHour' || k === 'dayEndHour')
      ? `Set the trading day to ${tradingDayLabel(result.tenant)}`
      : body.status === 'suspended' ? 'Suspended this café'
      : body.status === 'restricted'
        ? `Paused access pending payment${body.restrictedReason ? ` — ${body.restrictedReason}` : ''}`
      : (body.status === 'active' || body.status === 'trial') && changed.every((k) => k === 'status' || k === 'trialDays')
        ? 'Restored access'
      : body.trialDays !== undefined && changed.length === 1
        ? `Set the trial to ${body.trialDays} days`
      : `Changed ${changed.map((k) => FIELD_LABELS[k]).join(', ')}`
    await recordAudit({
      actorId: owner.userId, actorEmail: owner.email,
      tenantId: id, tenantName: result.tenant?.name,
      action: 'tenant_updated', detail,
    })
  }
  return NextResponse.json(result.tenant)
}
