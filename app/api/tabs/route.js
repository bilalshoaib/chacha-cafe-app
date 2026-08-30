import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/session'
import { listOpenTabs, openTab, MAX_LABEL } from '@/lib/repositories/tabsRepository'
import { getTenantDayHours } from '@/lib/repositories/tenantsRepository'
import { getUserById } from '@/lib/repositories/usersRepository'
import { shiftDateForInstant } from '@/lib/shift'

/** Every tab currently being added to. */
export async function GET() {
  const ctx = await requireTenant()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ tabs: await listOpenTabs(ctx) })
}

/**
 * Opens a tab.
 *
 * The label is the only thing required, because it is the only thing staff
 * need to find it again — an empty tab named "Table 4" is a useful thing to
 * have on screen before a single drink has been chosen.
 */
export async function POST(request) {
  const ctx = await requireTenant()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const label = String(body.label ?? '').trim()
  if (!label) return NextResponse.json({ error: 'Give the tab a name — a table number will do.' }, { status: 400 })
  if (label.length > MAX_LABEL) {
    return NextResponse.json({ error: `A tab name can be at most ${MAX_LABEL} characters.` }, { status: 400 })
  }

  // Stamped with the trading day it was opened in, on the café's own clock,
  // so a tab left open overnight can still be found by the shift it belongs
  // to rather than by a calendar date that means nothing to the staff.
  const { startHour, timezone } = await getTenantDayHours(ctx.tenantId)
  const shiftDate = shiftDateForInstant(new Date(), { shiftStartHour: startHour, timezone })

  const openedByEmail = ctx.actorEmail
    ?? (await getUserById(ctx, ctx.userId).catch(() => null))?.email
    ?? null

  const tab = await openTab(ctx, {
    label,
    openedBy: ctx.userId ?? null,
    openedByEmail,
    shiftDate,
    orderType: body.orderType ?? null,
  })
  return NextResponse.json({ tab }, { status: 201 })
}
