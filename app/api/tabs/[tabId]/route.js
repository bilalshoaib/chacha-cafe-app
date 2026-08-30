import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/session'
import { getTab, updateTab, abandonTab, MAX_LABEL } from '@/lib/repositories/tabsRepository'

const VALID_ORDER_TYPES = ['takeaway', 'dine_in', 'delivery']

export async function GET(_request, { params }) {
  const ctx = await requireTenant()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tabId } = await params
  const tab = await getTab(ctx, tabId)
  if (!tab) return NextResponse.json({ error: 'That tab is not here any more.' }, { status: 404 })
  return NextResponse.json({ tab })
}

/**
 * Changes what is on a tab.
 *
 * `version` is required. Two servers can have the same tab open, and a write
 * without one is a write that cannot be checked — it would let the second
 * person's save quietly delete the round the first just added. A stale version
 * comes back as 409 with the current tab attached, so the client can show what
 * it actually says now rather than guessing.
 */
export async function PATCH(request, { params }) {
  const ctx = await requireTenant()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tabId } = await params
  const body = await request.json().catch(() => ({}))

  if (body.version === undefined || !Number.isFinite(Number(body.version))) {
    return NextResponse.json({ error: 'A tab edit has to say which version it is based on.' }, { status: 400 })
  }
  if (body.label !== undefined) {
    const label = String(body.label).trim()
    if (!label) return NextResponse.json({ error: 'A tab needs a name.' }, { status: 400 })
    if (label.length > MAX_LABEL) {
      return NextResponse.json({ error: `A tab name can be at most ${MAX_LABEL} characters.` }, { status: 400 })
    }
  }
  if (body.orderType !== undefined && body.orderType !== null && !VALID_ORDER_TYPES.includes(body.orderType)) {
    return NextResponse.json({ error: 'That is not an order type.' }, { status: 400 })
  }
  if (body.lines !== undefined && !Array.isArray(body.lines)) {
    return NextResponse.json({ error: 'Lines must be a list.' }, { status: 400 })
  }

  const result = await updateTab(ctx, tabId, {
    lines: body.lines,
    label: body.label,
    orderType: body.orderType,
    customerNote: body.customerNote,
    expectedVersion: Number(body.version),
  })

  if (result.missing) return NextResponse.json({ error: 'That tab is not here any more.' }, { status: 404 })
  if (result.conflict) {
    const wasClosed = result.tab.status !== 'open'
    return NextResponse.json({
      error: wasClosed
        ? `That tab has already been ${result.tab.status === 'invoiced' ? 'rung up' : 'closed'}.`
        : 'Somebody else changed this tab while you were editing it.',
      tab: result.tab,
    }, { status: 409 })
  }
  return NextResponse.json({ tab: result.tab })
}

/** Walked out on, or opened by mistake. Kept as a record, not deleted. */
export async function DELETE(_request, { params }) {
  const ctx = await requireTenant()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tabId } = await params
  const tab = await abandonTab(ctx, tabId)
  if (!tab) {
    const current = await getTab(ctx, tabId)
    if (!current) return NextResponse.json({ error: 'That tab is not here any more.' }, { status: 404 })
    return NextResponse.json(
      { error: `That tab has already been ${current.status === 'invoiced' ? 'rung up' : 'closed'}.`, tab: current },
      { status: 409 },
    )
  }
  return NextResponse.json({ tab })
}
