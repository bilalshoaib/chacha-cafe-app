import { NextResponse } from 'next/server'
import { requireTenant, requireTenantSuperAdmin } from '@/lib/session'
import { getInvoicesForShift } from '@/lib/repositories/invoicesRepository'
import { findExpenses } from '@/lib/repositories/expensesRepository'
import { getTenantDayHours } from '@/lib/repositories/tenantsRepository'
import { getShiftClose, closeShift } from '@/lib/repositories/shiftClosesRepository'
import { buildZReport, parseCloseInput } from '@/lib/zReport'
import { shiftDateForInstant } from '@/lib/shift'
import { getUserById } from '@/lib/repositories/usersRepository'
import { recordAudit } from '@/lib/audit'

const SHIFT_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The Z-report for one trading day, closed or not.
 *
 * A day that has been closed returns the figures frozen at the moment it was
 * closed, and says so. A day still open is computed fresh on every read — it
 * is a preview of what closing would record, and it moves as sales come in,
 * which is what a manager wants while the shift is still running.
 *
 * The two are never mixed. A caller can always tell which it is holding from
 * `closed`, because a frozen report and a live one answer different questions
 * and treating one as the other is how a café ends up reconciling against a
 * figure that has quietly changed since it was signed off.
 */
export async function GET(_request, { params }) {
  const ctx = await requireTenant()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { shiftDate } = await params
  if (!SHIFT_DATE.test(shiftDate)) {
    return NextResponse.json({ error: 'A shift date looks like 2026-08-30.' }, { status: 400 })
  }

  const existing = await getShiftClose(ctx, shiftDate)
  if (existing) {
    return NextResponse.json({ closed: true, close: existing, report: existing.report })
  }

  const report = await liveReport(ctx, shiftDate)
  return NextResponse.json({ closed: false, close: null, report })
}

/**
 * Closes the day.
 *
 * Restricted to a café's super admin. Counting the drawer is the check on
 * whoever was working the till, so the person who closes has to be able to be
 * somebody other than the person who sold — a cashier signing off their own
 * variance is not a control at all.
 */
export async function POST(request, { params }) {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Only an owner can close the day.' }, { status: 403 })

  const { shiftDate } = await params
  if (!SHIFT_DATE.test(shiftDate)) {
    return NextResponse.json({ error: 'A shift date looks like 2026-08-30.' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = parseCloseInput(body)
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { countedCash, openingFloat, note } = parsed.value

  // Computed here from the invoices, never taken from the request. The client
  // showed a preview; the server decides what is recorded — the same rule
  // checkout follows for a price, and for the same reason: this figure is the
  // one a variance is measured against.
  const report = await liveReport(ctx, shiftDate, { openingFloat, countedCash })

  // Named on the row as well as referenced, so a close still says who signed
  // it off after that person has left and their user row is gone.
  const closer = ctx.actorEmail ?? (await getUserById(ctx, ctx.userId).catch(() => null))?.email ?? null

  const close = await closeShift(ctx, {
    shiftDate,
    closedBy: ctx.userId ?? null,
    closedByEmail: closer,
    openingFloat,
    countedCash,
    expectedCash: report.expectedCash,
    variance: report.variance,
    note,
    report,
  })

  // Null means the unique constraint refused it: the day was already closed,
  // by another device or a double press. The existing close is returned rather
  // than an error, because the caller's intent — "this day is closed" — is
  // satisfied, and it needs to see the count that actually stands.
  if (!close) {
    const already = await getShiftClose(ctx, shiftDate)
    return NextResponse.json(
      { error: 'That day has already been closed.', close: already },
      { status: 409 },
    )
  }

  await recordAudit({
    actorId: ctx.userId,
    actorEmail: close.closedByEmail,
    tenantId: ctx.tenantId,
    action: 'shift_closed',
    detail: varianceLine(shiftDate, close),
  })

  return NextResponse.json({ closed: true, close, report }, { status: 201 })
}

/** "Closed 2026-08-30. Drawer was 3.50 over." — the line the trail carries. */
function varianceLine(shiftDate, close) {
  const v = Number(close.variance)
  if (v === 0) return `Closed ${shiftDate}. The drawer balanced.`
  const amount = Math.abs(v).toFixed(2)
  return `Closed ${shiftDate}. The drawer was ${amount} ${v > 0 ? 'over' : 'short'}.`
}

/**
 * The report as the invoices currently stand.
 *
 * Expenses are matched to the shift by asking which trading day each one falls
 * in, using the café's own hours and zone — the same question the till asked
 * when it stamped the sale. The window read from the database is deliberately
 * wider than the day, because a shift that opens at 6 PM runs into the next
 * calendar date and a `spent_at` on either side of midnight can belong to it.
 */
async function liveReport(ctx, shiftDate, { openingFloat = 0, countedCash = null } = {}) {
  const { startHour, timezone } = await getTenantDayHours(ctx.tenantId)

  const invoices = await getInvoicesForShift(ctx, shiftDate)

  const from = new Date(`${shiftDate}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - 1)
  const to = new Date(`${shiftDate}T00:00:00Z`)
  to.setUTCDate(to.getUTCDate() + 2)
  const nearby = await findExpenses(ctx, { from: from.toISOString(), to: to.toISOString() })
  const expenses = nearby.filter((e) => {
    const at = new Date(e.spentAt ?? e.createdAt)
    if (Number.isNaN(at.getTime())) return false
    return shiftDateForInstant(at, { shiftStartHour: startHour, timezone }) === shiftDate
  })

  return buildZReport({ shiftDate, invoices, expenses, openingFloat, countedCash })
}
