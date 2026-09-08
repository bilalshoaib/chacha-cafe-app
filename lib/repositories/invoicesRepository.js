import { pool, withTenant } from '../db.js'
import { buildInvoiceWhere } from '../invoiceQuery.js'

function ts(val) {
  if (!val) return null
  return val instanceof Date ? val.toISOString() : val
}

// pg parses DATE columns as a Date at local midnight, so toISOString() (which
// converts to UTC) can roll it back a calendar day — read the local fields instead.
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
    ...(row.table_number ? { tableNumber: row.table_number } : {}),
    deliveryCharge: row.delivery_charge != null ? Number(row.delivery_charge) : 0,
    // What tax was charged on this sale, as it was charged — never re-derived
    // from the café's current rates. Invoices written before tax existed carry
    // none, and read back as zero rather than as absent, so no caller has to
    // check before adding.
    taxTotal: row.tax_total != null ? Number(row.tax_total) : 0,
    taxLines: Array.isArray(row.tax_lines) ? row.tax_lines : [],
    taxInclusive: Boolean(row.tax_inclusive),
    ...(row.shift_number != null ? { shiftNumber: row.shift_number } : {}),
    ...(row.shift_date ? { shiftDate: dateOnly(row.shift_date) } : {}),
    createdAt: ts(row.created_at),
  }
}

/** Atomically returns the next order number for a shift, creating the counter row if needed. */
export async function nextShiftNumber(ctx, shiftDate) {
  // Per café, not per platform. The counter used to be keyed on the date
  // alone, which meant two cafés open on the same evening drew from one
  // sequence and neither's receipts counted 1, 2, 3.
  const res = await pool.query(
    `INSERT INTO shift_counters (tenant_id, shift_date, counter) VALUES ($1, $2, 1)
     ON CONFLICT (tenant_id, shift_date) DO UPDATE SET counter = shift_counters.counter + 1
     RETURNING counter`,
    [ctx.tenantId, shiftDate],
  )
  return res.rows[0].counter
}

/**
 * Reserves `count` order numbers for a shift in one statement, and returns
 * them in order.
 *
 * A till that has gone offline cannot ask for a number per sale, so it takes a
 * block up front while it still can. Adding the whole block at once — rather
 * than calling nextShiftNumber in a loop — is what makes it atomic: two tills
 * reserving at the same moment get disjoint ranges, and neither has to hold a
 * transaction open while the other waits.
 *
 * The numbers are spent whether or not the till uses them. That is the trade:
 * a café that reserves fifty and sells three has its next customer called as
 * order #51. Gaps in a day's order numbers are cosmetic; two customers holding
 * the same number is not.
 */
export async function reserveShiftNumbers(ctx, shiftDate, count) {
  const n = Math.max(1, Math.floor(Number(count) || 0))
  const res = await pool.query(
    `INSERT INTO shift_counters (tenant_id, shift_date, counter) VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, shift_date) DO UPDATE SET counter = shift_counters.counter + $3
     RETURNING counter`,
    [ctx.tenantId, shiftDate, n],
  )
  // The row now holds the last number in the block, so the block starts n-1
  // back from it.
  const last = Number(res.rows[0].counter)
  return Array.from({ length: n }, (_, i) => last - n + 1 + i)
}

/**
 * Returns the next invoice number for this café.
 *
 * Per café, not per platform. Until 030 every café drew from one global
 * sequence, so a sale here took inv-200 and a sale ringing up in another café
 * at the same moment took inv-201 — neither café's invoices counted 1, 2, 3,
 * and the number on a customer's receipt said nothing about how many that café
 * had issued. Two cafés can now each hold an inv-1, which is what the
 * (tenant_id, id) primary key is for.
 *
 * The counter is bumped and read in one statement for the same reason
 * nextShiftNumber is: two tills asking at the same moment must get different
 * numbers, and neither should have to hold a transaction open to be sure of
 * it.
 */
export async function nextInvoiceNumber(ctx) {
  const res = await pool.query(
    `INSERT INTO invoice_counters (tenant_id, counter) VALUES ($1, 1)
     ON CONFLICT (tenant_id) DO UPDATE SET counter = invoice_counters.counter + 1
     RETURNING counter`,
    [ctx.tenantId],
  )
  return res.rows[0].counter
}

/**
 * Reserves `count` invoice numbers in one round trip, for a till about to lose
 * its connection. See reserveShiftNumbers for why a block rather than a call
 * per sale; the same reasoning applies, and the same numbers are spent whether
 * used or not.
 *
 * None of them is ever handed back. The counter is shared by every till in the
 * café, so winding it backwards would re-issue numbers another till is already
 * printing on receipts.
 */
export async function reserveInvoiceNumbers(ctx, count) {
  const n = Math.max(1, Math.floor(Number(count) || 0))
  const res = await pool.query(
    `INSERT INTO invoice_counters (tenant_id, counter) VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO UPDATE SET counter = invoice_counters.counter + $2
     RETURNING counter`,
    [ctx.tenantId, n],
  )
  // The row now holds the last number in the block, so the block starts n-1
  // back from it.
  const last = Number(res.rows[0].counter)
  return Array.from({ length: n }, (_, i) => last - n + 1 + i)
}

/** How many invoices match the filters. The caller needs it to size the pager. */
export async function countInvoices(ctx, filters = {}) {
  return withTenant(ctx, async (client) => {
    const { whereSql, values } = buildInvoiceWhere({ ...filters, tenantId: ctx.tenantId })
    const res = await client.query(`SELECT COUNT(*)::int AS total FROM invoices ${whereSql}`, values)
    return res.rows[0].total
  })
}

/**
 * One page of the invoice list, filtered and ordered by the database.
 *
 * This used to be a bare `SELECT *` with the filtering, sorting and slicing
 * done in JavaScript afterwards, so every visit to the invoices page pulled
 * the whole table into memory to show twenty rows.
 */
export async function findInvoices(ctx, filters = {}, { limit = 20, offset = 0 } = {}) {
  return withTenant(ctx, async (client) => {
    const { whereSql, values } = buildInvoiceWhere({ ...filters, tenantId: ctx.tenantId })
    // id breaks ties on created_at. Without a tiebreaker the order of equal
    // timestamps is undefined, and a row can show up on two pages or on none.
    const res = await client.query(
      `SELECT * FROM invoices ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    )
    return res.rows.map(rowToInvoice)
  })
}

/** Invoices created within a date range — reports read only their window. */
export async function getInvoicesInRange(ctx, from, to) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `SELECT * FROM invoices
        WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
        ORDER BY created_at DESC`,
      [ctx.tenantId, from, to],
    )
    return res.rows.map(rowToInvoice)
  })
}

/**
 * Every invoice belonging to one trading day.
 *
 * By shift_date rather than a timestamp window, which is the whole reason the
 * column exists: a café trading 6 PM to 5 PM spans two calendar dates, and the
 * question "what did we take last night" has an exact answer already stamped
 * on the row. Deriving a window from the hours instead would have to redo the
 * timezone arithmetic the till already did, and could disagree with it.
 *
 * Returned invoices are included. A refund is a movement of money, and a
 * drawer that is short by exactly the amount refunded is not a discrepancy.
 */
export async function getInvoicesForShift(ctx, shiftDate) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      `SELECT * FROM invoices
        WHERE tenant_id = $1 AND shift_date = $2
        ORDER BY shift_number NULLS LAST, created_at`,
      [ctx.tenantId, shiftDate],
    )
    return res.rows.map(rowToInvoice)
  })
}

export async function getInvoiceById(ctx, id) {
  return withTenant(ctx, async (client) => {
    const res = await client.query(
      'SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2',
      [id, ctx.tenantId],
    )
    return res.rows[0] ? rowToInvoice(res.rows[0]) : null
  })
}

/** Upserts a single invoice, without touching the rest of the table. */
export async function saveInvoice(ctx, inv) {
  return withTenant(ctx, async (client) => {
    await client.query(
      `INSERT INTO invoices
         (id, order_id, business_type, customer_note, lines, subtotal, total,
          paid, paid_at, returned, returned_at, return_note, payment_method, order_type, table_number, delivery_charge,
          tax_total, tax_lines, tax_inclusive,
          shift_date, shift_number, created_at, tenant_id, location_id)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21,$22,$23,$24)
       -- The conflict target is the whole key, which since 030 is the pair.
       -- On (id) alone this would now raise: there is no unique constraint on
       -- the id by itself any more, because two cafés are each allowed an
       -- inv-1. Matching on the pair is also what stops one café's save from
       -- ever reaching another café's row of the same number.
       ON CONFLICT (tenant_id, id) DO UPDATE SET
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
         table_number    = EXCLUDED.table_number,
         delivery_charge = EXCLUDED.delivery_charge,
         -- Editing an invoice re-prices its lines, so the tax it carries is
         -- recomputed with them. Left out of this list it would keep the old
         -- amount against new lines and the receipt would not add up.
         tax_total       = EXCLUDED.tax_total,
         tax_lines       = EXCLUDED.tax_lines,
         tax_inclusive   = EXCLUDED.tax_inclusive`,
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
        inv.tableNumber ?? null,
        inv.deliveryCharge ?? 0,
        inv.taxTotal ?? 0,
        JSON.stringify(inv.taxLines ?? []),
        Boolean(inv.taxInclusive),
        inv.shiftDate ?? null,
        inv.shiftNumber ?? null,
        inv.createdAt ?? new Date().toISOString(),
        ctx.tenantId,
        inv.locationId ?? ctx.locationId ?? null,
      ],
    )
  })
}
