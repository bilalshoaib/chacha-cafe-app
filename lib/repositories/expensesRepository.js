import { pool } from '../db.js'

function ts(val) {
  if (!val) return null
  return val instanceof Date ? val.toISOString() : val
}

function rowToExpense(row) {
  return {
    id: row.id,
    title: row.title,
    amount: Number(row.amount),
    category: row.category,
    businessType: row.business_type,
    note: row.note ?? '',
    spentAt: ts(row.spent_at),
    createdAt: ts(row.created_at),
  }
}

/**
 * Expenses matching the given filters, newest first.
 *
 * Replaces a bare `SELECT *` that every caller then filtered in JavaScript —
 * including the two report endpoints, which read the whole table to sum a
 * single month.
 *
 * from/to bound the date the money was spent. spent_at is NOT NULL, but the
 * COALESCE mirrors the `spentAt || createdAt` the callers used, so a row that
 * somehow lacks one still falls back the same way. businessType is an exact
 * match — unlike invoices, an expense belongs to one business only.
 */
export async function findExpenses({ from, to, businessType } = {}) {
  const where = []
  const values = []

  if (from) { values.push(from); where.push(`COALESCE(spent_at, created_at) >= $${values.length}`) }
  if (to) { values.push(to); where.push(`COALESCE(spent_at, created_at) <= $${values.length}`) }
  if (businessType) { values.push(businessType); where.push(`business_type = $${values.length}`) }

  // Expenses are entered as dates, so same-day rows all share midnight and the
  // bare spent_at ordering left them in whatever order the table happened to
  // return — undefined, and liable to shift on its own. created_at breaks the
  // tie by when the expense was actually recorded, newest first, which matches
  // how the rest of the list reads.
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const res = await pool.query(
    `SELECT * FROM expenses ${whereSql} ORDER BY spent_at DESC, created_at DESC, id DESC`,
    values,
  )
  return res.rows.map(rowToExpense)
}

/** One expense by id. Callers used to read the whole table and find() it. */
export async function getExpenseById(id) {
  const res = await pool.query('SELECT * FROM expenses WHERE id = $1', [id])
  return res.rows[0] ? rowToExpense(res.rows[0]) : null
}

export async function saveExpenses(expenses) {
  if (!expenses.length) return
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const e of expenses) {
      await client.query(
        `INSERT INTO expenses (id, title, amount, category, business_type, note, spent_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           title         = EXCLUDED.title,
           amount        = EXCLUDED.amount,
           category      = EXCLUDED.category,
           business_type = EXCLUDED.business_type,
           note          = EXCLUDED.note,
           spent_at      = EXCLUDED.spent_at`,
        [
          e.id,
          e.title,
          e.amount,
          e.category ?? 'other',
          e.businessType ?? 'cafe',
          e.note ?? '',
          e.spentAt ?? new Date().toISOString(),
          e.createdAt ?? new Date().toISOString(),
        ],
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** Controller calls this directly to delete one expense. */
export async function deleteExpenseById(id) {
  const res = await pool.query('DELETE FROM expenses WHERE id = $1 RETURNING id', [id])
  return res.rowCount > 0
}
