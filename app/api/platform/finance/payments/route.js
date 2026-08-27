import { NextResponse } from 'next/server'
import { requirePlatformOwner } from '@/lib/session'
import { listPayments, recordPayment } from '@/lib/repositories/platformFinanceRepository'
import { recordAudit } from '@/lib/audit'

export async function GET(request) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  const q = new URL(request.url).searchParams
  return NextResponse.json(await listPayments({
    from: q.get('from'), to: q.get('to'), tenantId: q.get('tenantId'),
  }))
}

export async function POST(request) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const result = await recordPayment(body, owner.userId)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  // Written to the café's own trail: their owner can see that the platform has
  // recorded their payment, which is the point of the trail being theirs.
  await recordAudit({
    actorId: owner.userId, actorEmail: owner.email,
    tenantId: result.payment.tenantId, tenantName: result.payment.tenantName,
    action: 'payment_recorded',
    detail: `Recorded a payment of ${result.payment.amount}${result.payment.period ? ` for ${result.payment.period.slice(0, 7)}` : ''}`,
  })
  return NextResponse.json(result.payment, { status: 201 })
}
