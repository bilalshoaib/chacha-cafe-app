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

export async function getExpenses() {
  const res = await pool.query('SELECT * FROM expenses ORDER BY spent_at DESC')
  return res.rows.map(rowToExpense)
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
