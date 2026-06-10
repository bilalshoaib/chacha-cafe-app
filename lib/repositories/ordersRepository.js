import { pool } from '../db.js'

function rowToOrder(row) {
  return {
    id: row.id,
    businessType: row.business_type,
    status: row.status,
    lines: Array.isArray(row.lines) ? row.lines : [],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    ...(row.invoiced_at ? { invoicedAt: row.invoiced_at instanceof Date ? row.invoiced_at.toISOString() : row.invoiced_at } : {}),
    ...(row.invoice_id ? { invoiceId: row.invoice_id } : {}),
  }
}

export async function getOrders() {
  const res = await pool.query('SELECT * FROM orders ORDER BY created_at DESC')
  return res.rows.map(rowToOrder)
}

/**
 * Upsert all orders.
 * Controllers load all orders, mutate one, and call saveOrders(all) — same pattern as JSON.
 */
export async function saveOrders(orders) {
  if (!orders.length) return
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const o of orders) {
      await client.query(
        `INSERT INTO orders (id, business_type, status, lines, created_at, invoiced_at, invoice_id)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           business_type = EXCLUDED.business_type,
           status        = EXCLUDED.status,
           lines         = EXCLUDED.lines,
           invoiced_at   = EXCLUDED.invoiced_at,
           invoice_id    = EXCLUDED.invoice_id`,
        [
          o.id,
          o.businessType ?? 'cafe',
          o.status ?? 'open',
          JSON.stringify(o.lines ?? []),
          o.createdAt ?? new Date().toISOString(),
          o.invoicedAt ?? null,
          o.invoiceId ?? null,
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
