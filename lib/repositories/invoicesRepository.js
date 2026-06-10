import { pool } from '../db.js'

function ts(val) {
  if (!val) return null
  return val instanceof Date ? val.toISOString() : val
}

function rowToInvoice(row) {
  return {
    id: row.id,
    orderId: row.order_id ?? null,
    businessType: row.business_type,
    customerNote: row.customer_note ?? '',
    lines: Array.isArray(row.lines) ? row.lines : [],
    subtotal: Number(row.subtotal),
    total: Number(row.total),
    paid: Boolean(row.paid),
    ...(row.paid_at ? { paidAt: ts(row.paid_at) } : {}),
    returned: Boolean(row.returned),
    ...(row.returned_at ? { returnedAt: ts(row.returned_at) } : {}),
    ...(row.return_note != null ? { returnNote: row.return_note } : {}),
    ...(row.payment_method ? { paymentMethod: row.payment_method } : {}),
    createdAt: ts(row.created_at),
  }
}

export async function getInvoices() {
  const res = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC')
  return res.rows.map(rowToInvoice)
}

export async function saveInvoices(invoices) {
  if (!invoices.length) return
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const inv of invoices) {
      await client.query(
        `INSERT INTO invoices
           (id, order_id, business_type, customer_note, lines, subtotal, total,
            paid, paid_at, returned, returned_at, return_note, payment_method, created_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO UPDATE SET
           order_id       = EXCLUDED.order_id,
           business_type  = EXCLUDED.business_type,
           customer_note  = EXCLUDED.customer_note,
           lines          = EXCLUDED.lines,
           subtotal       = EXCLUDED.subtotal,
           total          = EXCLUDED.total,
           paid           = EXCLUDED.paid,
           paid_at        = EXCLUDED.paid_at,
           returned       = EXCLUDED.returned,
           returned_at    = EXCLUDED.returned_at,
           return_note    = EXCLUDED.return_note,
           payment_method = EXCLUDED.payment_method`,
        [
          inv.id,
          inv.orderId ?? null,
          inv.businessType ?? 'cafe',
          inv.customerNote ?? '',
          JSON.stringify(inv.lines ?? []),
          inv.subtotal ?? 0,
          inv.total ?? 0,
          Boolean(inv.paid),
          inv.paidAt ?? null,
          Boolean(inv.returned),
          inv.returnedAt ?? null,
          inv.returnNote ?? null,
          inv.paymentMethod ?? null,
          inv.createdAt ?? new Date().toISOString(),
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
