import { NextResponse } from 'next/server'
import { requirePlatformOwner } from '@/lib/session'
import { deletePayment } from '@/lib/repositories/platformFinanceRepository'

export async function DELETE(_request, { params }) {
  const owner = await requirePlatformOwner()
  if (!owner) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 })
  const { id } = await params
  const result = await deletePayment(id)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 404 })
  return NextResponse.json({ ok: true })
}
