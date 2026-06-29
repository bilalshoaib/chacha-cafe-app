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
    ...(row.order_type ? { orderType: row.order_type } : {}),
    deliveryCharge: row.delivery_charge != null ? Number(row.delivery_charge) : 0,
    createdAt: ts(row.created_at),
  }
}

/** Returns the next sequential number for an invoice prefix (cafe | burger | combined). */
export async function nextInvoiceNumber(slug) {
  const allowed = ['cafe', 'burger', 'combined']
  if (!allowed.includes(slug)) throw new Error(`Unknown invoice slug: ${slug}`)
  const res = await pool.query(`SELECT nextval($1)`, [`invoice_seq_${slug}`])
  return Number(res.rows[0].nextval)
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
            paid, paid_at, returned, returned_at, return_note, payment_method, order_type, delivery_charge, created_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (id) DO UPDATE SET
           order_id        = EXCLUDED.order_id,
           business_type   = EXCLUDED.business_type,
           customer_note   = EXCLUDED.customer_note,
           lines           = EXCLUDED.lines,
           subtotal        = EXCLUDED.subtotal,
           total           = EXCLUDED.total,
           paid            = EXCLUDED.paid,
           paid_at         = EXCLUDED.paid_at,
           returned        = EXCLUDED.returned,
           returned_at     = EXCLUDED.returned_at,
           return_note     = EXCLUDED.return_note,
           payment_method  = EXCLUDED.payment_method,
           order_type      = EXCLUDED.order_type,
           delivery_charge = EXCLUDED.delivery_charge`,
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
          inv.orderType ?? null,
          inv.deliveryCharge ?? 0,
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
