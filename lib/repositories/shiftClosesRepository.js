import { randomUUID } from 'crypto'
import { withTenant } from '../db.js'

/**
 * The record that a trading day was counted and closed.
 *
 * One row per café per shift date, written once. Everything about the night is
 * frozen into it — see migration 028 for why a Z-report that can change after
 * it was signed off is not evidence of anything.
 */

function rowToClose(row) {
  if (!row) return null
  return {
    id: row.id,
    shiftDate: dateOnly(row.shift_date),
    closedAt: row.closed_at instanceof Date ? row.closed_at.toISOString() : row.closed_at,
    closedBy: row.closed_by ?? null,
    closedByEmail: row.closed_by_email ?? null,
    openingFloat: Number(row.opening_float),
    countedCash: Number(row.counted_cash),
    expectedCash: Number(row.expected_cash),
    variance: Number(row.variance),
    note: row.note ?? '',
    // The Z-report as it read on the night. Returned under `report` rather
    // than spread, so a caller can never mistake the frozen figures for
    // freshly computed ones.
    report: row.totals && typeof row.totals === 'object' ? row.totals : {},
  }
}

// pg parses DATE as a Date at local midnight, so toISOString() can roll it
// back a calendar day. The same reasoning as invoicesRepository.dateOnly.
function dateOnly(val) {
  if (!val) return null
  if (val instanceof Date) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(val).slice(0, 10)
}

/** The close for one trading day, or null if it is still open. */
export async function getShiftClose(ctx, shiftDate) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `SELECT * FROM shift_closes WHERE tenant_id = $1 AND shift_date = $2`,
      [ctx.tenantId, shiftDate],
    )
    return rowToClose(res.rows[0])
  })
}

/** The most recent closes, for the history list. */
export async function listShiftCloses(ctx, { limit = 30 } = {}) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `SELECT * FROM shift_closes WHERE tenant_id = $1
        ORDER BY shift_date DESC LIMIT $2`,
      [ctx.tenantId, Math.min(365, Math.max(1, Number(limit) || 30))],
    )
    return res.rows.map(rowToClose)
  })
}

/**
 * Closes a trading day.
 *
 * `ON CONFLICT DO NOTHING` rather than an upsert: a day is closed once, and a
 * second attempt is a double-submit or a second manager on another device.
 * Overwriting would replace one signed-off count with another silently, so the
 * write is refused instead and the caller is told the day is already closed.
 */
export async function closeShift(ctx, {
  shiftDate, closedBy, closedByEmail,
  openingFloat, countedCash, expectedCash, variance, note, report,
}) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `INSERT INTO shift_closes
         (id, tenant_id, shift_date, closed_by, closed_by_email,
          opening_float, counted_cash, expected_cash, variance, note, totals)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
       ON CONFLICT (tenant_id, shift_date) DO NOTHING
       RETURNING *`,
      [
        `zc-${randomUUID().slice(0, 8)}`,
        ctx.tenantId,
        shiftDate,
        closedBy ?? null,
        closedByEmail ?? null,
        openingFloat,
        countedCash,
        expectedCash,
        variance,
        note ?? '',
        JSON.stringify(report ?? {}),
      ],
    )
    return rowToClose(res.rows[0])
  })
}

/**
 * Reopens a closed day.
 *
 * Deliberately present and deliberately narrow. A manager who fat-fingers the
 * count has to be able to fix it, and the alternative — living with a wrong
 * variance forever — makes the whole record less trustworthy, not more. The
 * route above it restricts who may do this, and the audit trail records it.
 */
export async function reopenShift(ctx, shiftDate) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `DELETE FROM shift_closes WHERE tenant_id = $1 AND shift_date = $2 RETURNING *`,
      [ctx.tenantId, shiftDate],
    )
    return rowToClose(res.rows[0])
  })
}
