import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/session'
import { getTenantDayHours } from '@/lib/repositories/tenantsRepository'
import { listShiftCloses } from '@/lib/repositories/shiftClosesRepository'
import { shiftDateForInstant } from '@/lib/shift'

/**
 * The days this café has closed, and which one it is trading in now.
 *
 * The current trading day is answered here rather than worked out on the
 * client, for the same reason the reservation endpoint answers it: it depends
 * on the café's opening hour and its timezone, and a browser sitting in
 * another zone — a manager checking from home, the platform owner on a support
 * call — would get a different and wrong answer.
 */
export async function GET() {
  const ctx = await requireTenant()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { startHour, timezone } = await getTenantDayHours(ctx.tenantId)
  const today = shiftDateForInstant(new Date(), { shiftStartHour: startHour, timezone })

  return NextResponse.json({
    today,
    dayStartHour: startHour,
    timezone,
    closes: await listShiftCloses(ctx, { limit: 30 }),
  })
}
