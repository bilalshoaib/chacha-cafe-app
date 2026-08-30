import { randomUUID } from 'crypto'
import { withTenant } from '../db.js'

/**
 * Orders held open on the server rather than in one browser.
 *
 * A tab is a cart that outlives the device that started it: a server takes
 * table four's order on a handheld, another adds to it, and the till rings it
 * up. That is the whole of the feature, and everything awkward about it
 * follows from the same fact — more than one person can be holding it.
 *
 * Hence `version`. Every write says which version it read, and is refused if
 * that is no longer current. See updateTab.
 */

export const TAB_STATUSES = ['open', 'invoiced', 'abandoned']
export const MAX_LABEL = 60

function rowToTab(row) {
  if (!row) return null
  return {
    id: row.id,
    label: row.label,
    status: row.status,
    lines: Array.isArray(row.lines) ? row.lines : [],
    orderType: row.order_type ?? null,
    customerNote: row.customer_note ?? '',
    version: Number(row.version),
    openedBy: row.opened_by ?? null,
    openedByEmail: row.opened_by_email ?? null,
    openedAt: ts(row.opened_at),
    updatedAt: ts(row.updated_at),
    closedAt: ts(row.closed_at),
    invoiceId: row.invoice_id ?? null,
    shiftDate: dateOnly(row.shift_date),
  }
}

function ts(v) {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : v
}

// pg reads DATE as a Date at local midnight, so toISOString() can roll it back
// a day. Same reasoning as invoicesRepository.dateOnly.
function dateOnly(v) {
  if (!v) return null
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(v).slice(0, 10)
}

/** Every tab still being added to, most recently touched first. */
export async function listOpenTabs(ctx) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `SELECT * FROM tabs WHERE tenant_id = $1 AND status = 'open'
        ORDER BY updated_at DESC`,
      [ctx.tenantId],
    )
    return res.rows.map(rowToTab)
  })
}

export async function getTab(ctx, id) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `SELECT * FROM tabs WHERE tenant_id = $1 AND id = $2`,
      [ctx.tenantId, id],
    )
    return rowToTab(res.rows[0])
  })
}

export async function openTab(ctx, { label, openedBy, openedByEmail, shiftDate, orderType = null }) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `INSERT INTO tabs (id, tenant_id, label, opened_by, opened_by_email, shift_date, order_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        `tab-${randomUUID().slice(0, 8)}`,
        ctx.tenantId,
        String(label).trim().slice(0, MAX_LABEL),
        openedBy ?? null,
        openedByEmail ?? null,
        shiftDate ?? null,
        orderType,
      ],
    )
    return rowToTab(res.rows[0])
  })
}

/**
 * Replaces what is on a tab.
 *
 * `expectedVersion` is the version the caller read before editing. The UPDATE
 * matches on it, so a second writer working from a stale copy changes no rows
 * and gets `{ conflict: true }` with the current tab attached — rather than
 * overwriting the lines the first writer just added.
 *
 * Whole-lines replacement rather than an add/remove API. The till already
 * holds the cart as an array and every existing operation on it — change a
 * quantity, apply a discount, drop a row — rewrites that array; a
 * finer-grained protocol would be a second way of expressing the same edits,
 * and the version check is what makes replacement safe.
 */
export async function updateTab(ctx, id, { lines, label, orderType, customerNote, expectedVersion }) {
  return withTenant(ctx, async (client) => {
    const sets = ['version = version + 1', 'updated_at = NOW()']
    const vals = []

    if (lines !== undefined) { vals.push(JSON.stringify(lines)); sets.push(`lines = $${vals.length}::jsonb`) }
    if (label !== undefined) { vals.push(String(label).trim().slice(0, MAX_LABEL)); sets.push(`label = $${vals.length}`) }
    if (orderType !== undefined) { vals.push(orderType); sets.push(`order_type = $${vals.length}`) }
    if (customerNote !== undefined) {
      vals.push(String(customerNote ?? '').slice(0, 200)); sets.push(`customer_note = $${vals.length}`)
    }

    vals.push(ctx.tenantId)
    const tenantParam = vals.length
    vals.push(id)
    const idParam = vals.length

    // Only an open tab may be edited. One that has been rung up is a record of
    // a sale that happened, and one that was abandoned is a record of a
    // customer who left.
    let where = `tenant_id = $${tenantParam} AND id = $${idParam} AND status = 'open'`
    if (expectedVersion != null) {
      vals.push(Number(expectedVersion))
      where += ` AND version = $${vals.length}`
    }

    const res = await client.query(`UPDATE tabs SET ${sets.join(', ')} WHERE ${where} RETURNING *`, vals)
    if (res.rowCount) return { tab: rowToTab(res.rows[0]) }

    // Nothing matched. Either somebody else got there first, or the tab is no
    // longer open — the caller needs to know which, and needs the current row
    // to show what it actually says now.
    const current = await client.query(
      `SELECT * FROM tabs WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, id],
    )
    if (!current.rowCount) return { missing: true }
    return { conflict: true, tab: rowToTab(current.rows[0]) }
  })
}

/**
 * Marks a tab as rung up, once its invoice exists.
 *
 * Guarded on `status = 'open'` so that two devices closing the same tab cannot
 * both succeed — the second gets no row, and its caller can tell the invoice
 * it just created is a duplicate before it hands anybody a receipt.
 */
export async function markTabInvoiced(ctx, id, invoiceId) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `UPDATE tabs SET status = 'invoiced', invoice_id = $3, closed_at = NOW(),
              version = version + 1, updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2 AND status = 'open'
        RETURNING *`,
      [ctx.tenantId, id, invoiceId],
    )
    return rowToTab(res.rows[0])
  })
}

/** Walked out on, or opened by mistake. Kept, never deleted — see migration 029. */
export async function abandonTab(ctx, id) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `UPDATE tabs SET status = 'abandoned', closed_at = NOW(),
              version = version + 1, updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2 AND status = 'open'
        RETURNING *`,
      [ctx.tenantId, id],
    )
    return rowToTab(res.rows[0])
  })
}
