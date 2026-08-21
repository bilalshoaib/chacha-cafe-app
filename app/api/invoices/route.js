import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/session'
import { countInvoices, findInvoices } from '@/lib/repositories/invoicesRepository'
import { normalizeBusinessType } from '@/lib/businessTypes'

function parsePageParam(raw, fallback) {
  const n = parseInt(String(raw ?? ''), 10)
  return Number.isFinite(n) && n >= 1 ? n : fallback
}

function parsePageSizeParam(raw, fallback = 20) {
  const n = parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(100, n)
}

export async function GET(request) {
  const ctx = await requireTenant()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)

  const fromRaw = searchParams.get('from')
  const toRaw = searchParams.get('to')
  const from = fromRaw ? new Date(fromRaw) : null
  const to = toRaw ? new Date(toRaw) : null
  if (fromRaw && Number.isNaN(from.getTime())) return NextResponse.json({ error: 'Invalid from date.' }, { status: 400 })
  if (toRaw && Number.isNaN(to.getTime())) return NextResponse.json({ error: 'Invalid to date.' }, { status: 400 })

  const businessType = normalizeBusinessType(searchParams.get('businessType'))
  const search = String(searchParams.get('search') ?? '').trim().toLowerCase()

  const filters = {
    from: from ? from.toISOString() : null,
    to: to ? to.toISOString() : null,
    businessType,
    search: search || null,
  }

  const pageSize = parsePageSizeParam(searchParams.get('pageSize'))
  const requestedPage = parsePageParam(searchParams.get('page'), 1)

  // The count comes first because a page number past the end is clamped to the
  // last page rather than returning nothing — the offset can't be worked out
  // until the total is known.
  const total = await countInvoices(ctx, filters)
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
  const page = Math.min(requestedPage, totalPages)

  const invoices = total === 0
    ? []
    : await findInvoices(ctx, filters, { limit: pageSize, offset: (page - 1) * pageSize })

  return NextResponse.json({
    invoices,
    pagination: { page, pageSize, total, totalPages },
  })
}
