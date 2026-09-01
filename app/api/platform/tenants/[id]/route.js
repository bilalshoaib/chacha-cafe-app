import { NextResponse } from 'next/server'
import { requirePlatformOwner } from '@/lib/session'
import { getTenant, updateTenant, deleteTenant, getTenantOwner } from '@/lib/repositories/tenantsRepository'
import { listAuditForTenant, recordAudit } from '@/lib/audit'
import { tradingDayLabel } from '@/lib/tradingDay'
import { timezoneInfo } from '@/constants/timezones'

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
  timezone: 'where they are',
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
    const dayChanged = body.dayStartHour !== undefined || body.dayEndHour !== undefined || body.timezone !== undefined
    const detail = dayChanged && changed.every((k) => k === 'dayStartHour' || k === 'dayEndHour' || k === 'timezone')
      // The zone is named alongside the hours because it is half of what they
      // mean — "6 PM" moved from Karachi to Chicago is an eleven-hour change to
      // which day a sale counts against, and the trail has to show it.
      ? `Set the trading day to ${tradingDayLabel(result.tenant)}, ${timezoneInfo(result.tenant?.timezone).city} time`
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

/**
 * Deletes a café and all of its data.
 *
 * Two locks the caller has to have opened first, because this is the one action
 * on the console with no undo:
 *   - the café is suspended — the deliberate first step, which has already
 *     signed everyone out and taken the public menu down;
 *   - the café's exact name comes back in the body, so a mis-click on the wrong
 *     café in a list does not end it.
 *
 * The deletion is written to the trail before the response returns. The trail
 * outlives the café on purpose (migration 021), so this entry stays readable in
 * the platform-wide activity feed afterwards.
 */
export async function DELETE(request, { params }) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  const { id } = await params

  const tenant = await getTenant(id)
  if (!tenant) return NextResponse.json({ error: 'Café not found.' }, { status: 404 })

  if (tenant.status !== 'suspended') {
    return NextResponse.json(
      { error: 'Suspend the café first — deleting is only possible once it is suspended.' },
      { status: 409 },
    )
  }

  const body = await request.json().catch(() => ({}))
  if (String(body.confirmName ?? '').trim() !== tenant.name) {
    return NextResponse.json({ error: 'Type the café’s name exactly to confirm.' }, { status: 400 })
  }

  const result = await deleteTenant(id)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  await recordAudit({
    actorId: owner.userId, actorEmail: owner.email,
    tenantId: id, tenantName: result.name,
    action: 'tenant_deleted',
    detail: 'Deleted this café and all of its data. Payment records and this trail were kept.',
  })

  return NextResponse.json({ ok: true })
}
