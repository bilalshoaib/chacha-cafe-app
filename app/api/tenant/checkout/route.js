import { NextResponse } from 'next/server'
import { requireTenantSuperAdmin } from '@/lib/session'
import { getCheckoutSettings, setNewOrderPayment } from '@/lib/repositories/checkoutSettingsRepository'
import { NEW_ORDER_PAYMENTS } from '@/lib/newOrderPayment'
import { recordAudit } from '@/lib/audit'

/**
 * How checkout treats a new order. Owner-only, like tax: a setting that marks
 * every sale paid decides what the drawer is expected to hold.
 */
export async function GET() {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await getCheckoutSettings(ctx))
}

const DETAIL = {
  unpaid: 'Set new orders to start unpaid',
  cash: 'Set new orders to be marked paid in cash',
  online: 'Set new orders to be marked paid online / by card',
}

export async function PATCH(request) {
  const ctx = await requireTenantSuperAdmin()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (!NEW_ORDER_PAYMENTS.includes(body.newOrderPayment)) {
    return NextResponse.json({ error: 'Choose unpaid, cash or online.' }, { status: 400 })
  }

  const value = await setNewOrderPayment(ctx, body.newOrderPayment)
  await recordAudit({
    actorId: ctx.userId,
    actorEmail: ctx.actorEmail ?? null,
    tenantId: ctx.tenantId,
    action: 'tenant_updated',
    detail: DETAIL[value],
  })
  return NextResponse.json({ newOrderPayment: value })
}
