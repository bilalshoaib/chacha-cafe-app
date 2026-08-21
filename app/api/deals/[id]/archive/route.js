import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/session'
import { setDealStatus } from '@/lib/repositories/menuRepository'

export async function PATCH(_request, { params }) {
  const ctx = await requireTenant()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const found = await setDealStatus(ctx, id, 'archived')
  if (!found) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
  return NextResponse.json({ ok: true, id, status: 'archived' })
}
