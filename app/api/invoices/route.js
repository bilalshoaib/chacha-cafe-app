import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { getInvoices } from '@/lib/repositories/invoicesRepository'
import { normalizeBusinessType } from '@/lib/businessTypes'

function invoiceBusinessType(inv) {
  if (inv?.businessType === 'combined') return 'combined'
  const explicit = normalizeBusinessType(inv?.businessType)
  if (explicit) return explicit
  if (String(inv?.id ?? '').startsWith('inv-burger-')) return 'burger'
  if (String(inv?.id ?? '').startsWith('inv-combined-')) return 'combined'
  return 'cafe'
}

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
  const session = await requireAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const invoices = await getInvoices()
  let list = Array.isArray(invoices) ? [...invoices] : []

  const fromRaw = searchParams.get('from')
  const toRaw = searchParams.get('to')
  if (fromRaw || toRaw) {
    const from = fromRaw ? new Date(fromRaw) : null
    const to = toRaw ? new Date(toRaw) : null
    if (fromRaw && Number.isNaN(from.getTime())) return NextResponse.json({ error: 'Invalid from date.' }, { status: 400 })
    if (toRaw && Number.isNaN(to.getTime())) return NextResponse.json({ error: 'Invalid to date.' }, { status: 400 })
    const fromMs = from ? from.getTime() : -Infinity
    const toMs = to ? to.getTime() : Infinity
    list = list.filter((inv) => {
      const t = new Date(inv.createdAt).getTime()
      return !Number.isNaN(t) && t >= fromMs && t <= toMs
    })
  }

  const businessRaw = normalizeBusinessType(searchParams.get('businessType'))
  if (businessRaw) {
    list = list.filter((inv) => {
      const bt = invoiceBusinessType(inv)
      // Combined invoices contain items from both businesses — show them in either filter
      return bt === businessRaw || bt === 'combined'
    })
  }

  const searchRaw = String(searchParams.get('search') ?? '').trim().toLowerCase()
  if (searchRaw) list = list.filter((inv) => String(inv.id).toLowerCase().includes(searchRaw))

  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const total = list.length
  const pageSize = parsePageSizeParam(searchParams.get('pageSize'))
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
  let page = parsePageParam(searchParams.get('page'), 1)
  if (page > totalPages) page = totalPages

  const start = (page - 1) * pageSize
  return NextResponse.json({
    invoices: list.slice(start, start + pageSize),
    pagination: { page, pageSize, total, totalPages },
  })
}
