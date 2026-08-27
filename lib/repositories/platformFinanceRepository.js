import { randomUUID } from 'crypto'
import { pool } from '../db.js'

/**
 * The platform's own books — what the cafés pay it, and what it spends.
 *
 * Every other repository takes a tenant context and runs inside withTenant(),
 * which steps down into a role that can only see one café. These queries
 * deliberately do not: they span every café, and the rows they read belong to
 * the platform rather than to any of them. Migration 024 revokes the tenant
 * roles' access to these three tables so that this is enforced by Postgres and
 * not merely by which function a route happened to call.
 *
 * The one gate is requirePlatformOwner(), which reads the flag from the
 * database rather than the session cookie.
 */

const PAYMENT_METHODS = ['bank', 'cash', 'card', 'online', 'other']

export const EXPENSE_CATEGORIES = [
  'hosting', 'domains', 'software', 'salaries', 'marketing', 'equipment', 'fees', 'other',
]

const money = (v) => (v == null ? 0 : Number(v))
const iso = (v) => (v instanceof Date ? v.toISOString() : v ?? null)
const dateOnly = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ? String(v).slice(0, 10) : null))

function newId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

/** The first day of the month an instant falls in, as YYYY-MM-DD. */
export function monthOf(value) {
  const d = value ? new Date(value) : new Date()
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

// ── Prices ──────────────────────────────────────────────────────────────────

export async function listPlanPrices() {
  const res = await pool.query('SELECT plan, monthly_price FROM plan_prices ORDER BY plan')
  const out = {}
  for (const r of res.rows) out[r.plan] = money(r.monthly_price)
  return out
}

export async function setPlanPrice(plan, price) {
  const amount = Number(price)
  if (!Number.isFinite(amount) || amount < 0) return { error: 'A price must be a number of 0 or more.' }
  const res = await pool.query(
    `INSERT INTO plan_prices (plan, monthly_price, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (plan) DO UPDATE SET monthly_price = EXCLUDED.monthly_price, updated_at = NOW()
     RETURNING plan`,
    [String(plan).slice(0, 30), amount],
  )
  if (!res.rowCount) return { error: 'Could not save that price.' }
  return { prices: await listPlanPrices() }
}

/**
 * What one café pays a month: its own negotiated amount if it has one, and
 * otherwise its plan's price. The single definition of it, because the report,
 * the arrears calculation and the café's own billing tab must agree.
 */
export function monthlyPriceOf(tenant, planPrices) {
  if (tenant?.monthlyPrice != null) return money(tenant.monthlyPrice)
  return money(planPrices?.[tenant?.plan] ?? 0)
}

// ── Money in ────────────────────────────────────────────────────────────────

function rowToPayment(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    amount: money(row.amount),
    method: row.method,
    period: dateOnly(row.period),
    note: row.note ?? '',
    receivedAt: iso(row.received_at),
  }
}

export async function listPayments({ from, to, tenantId, limit = 200 } = {}) {
  const where = []
  const vals = []
  if (from) { vals.push(from); where.push(`received_at >= $${vals.length}`) }
  if (to) { vals.push(to); where.push(`received_at <= $${vals.length}`) }
  if (tenantId) { vals.push(tenantId); where.push(`tenant_id = $${vals.length}`) }
  vals.push(Math.min(Number(limit) || 200, 500))
  const res = await pool.query(
    `SELECT * FROM platform_payments
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY received_at DESC LIMIT $${vals.length}`,
    vals,
  )
  return res.rows.map(rowToPayment)
}

export async function recordPayment(input, actorId) {
  const amount = Number(input?.amount)
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'A payment needs an amount above zero.' }

  const tenantId = String(input?.tenantId ?? '').trim()
  if (!tenantId) return { error: 'Which café paid?' }
  const t = await pool.query('SELECT id, name FROM tenants WHERE id = $1', [tenantId])
  if (!t.rowCount) return { error: 'That café does not exist.' }

  const method = PAYMENT_METHODS.includes(input?.method) ? input.method : 'bank'
  const receivedAt = input?.receivedAt ? new Date(input.receivedAt) : new Date()
  if (Number.isNaN(receivedAt.getTime())) return { error: 'The date received is not a date.' }
  // Absent means "no month in particular" — a one-off, a setup fee. Only a
  // stated month is held to one payment.
  const period = input?.period === null || input?.period === undefined || input?.period === ''
    ? null
    : monthOf(input.period)

  try {
    const res = await pool.query(
      `INSERT INTO platform_payments (id, tenant_id, tenant_name, amount, method, period, note, received_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [newId('pay'), tenantId, t.rows[0].name, amount, method, period,
       String(input?.note ?? '').slice(0, 500), receivedAt.toISOString(), actorId ?? null],
    )
    return { payment: rowToPayment(res.rows[0]) }
  } catch (e) {
    // The partial unique index, surfaced as something a person can act on.
    if (e.code === '23505') {
      return { error: `${t.rows[0].name} already has a payment recorded for that month.` }
    }
    throw e
  }
}

export async function deletePayment(id) {
  const res = await pool.query('DELETE FROM platform_payments WHERE id = $1 RETURNING id', [id])
  return res.rowCount ? { ok: true } : { error: 'That payment is already gone.' }
}

// ── Money out ───────────────────────────────────────────────────────────────

function rowToExpense(row) {
  return {
    id: row.id,
    title: row.title,
    amount: money(row.amount),
    category: row.category,
    note: row.note ?? '',
    recurring: Boolean(row.recurring),
    spentAt: iso(row.spent_at),
  }
}

export async function listExpenses({ from, to, limit = 200 } = {}) {
  const where = []
  const vals = []
  if (from) { vals.push(from); where.push(`spent_at >= $${vals.length}`) }
  if (to) { vals.push(to); where.push(`spent_at <= $${vals.length}`) }
  vals.push(Math.min(Number(limit) || 200, 500))
  const res = await pool.query(
    `SELECT * FROM platform_expenses
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY spent_at DESC LIMIT $${vals.length}`,
    vals,
  )
  return res.rows.map(rowToExpense)
}

export async function recordExpense(input, actorId) {
  const title = String(input?.title ?? '').trim().slice(0, 200)
  if (!title) return { error: 'An expense needs a description.' }

  const amount = Number(input?.amount)
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'An expense needs an amount above zero.' }

  const category = EXPENSE_CATEGORIES.includes(input?.category) ? input.category : 'other'
  const spentAt = input?.spentAt ? new Date(input.spentAt) : new Date()
  if (Number.isNaN(spentAt.getTime())) return { error: 'The date spent is not a date.' }

  const res = await pool.query(
    `INSERT INTO platform_expenses (id, title, amount, category, note, recurring, spent_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [newId('pex'), title, amount, category, String(input?.note ?? '').slice(0, 500),
     Boolean(input?.recurring), spentAt.toISOString(), actorId ?? null],
  )
  return { expense: rowToExpense(res.rows[0]) }
}

export async function deleteExpense(id) {
  const res = await pool.query('DELETE FROM platform_expenses WHERE id = $1 RETURNING id', [id])
  return res.rowCount ? { ok: true } : { error: 'That expense is already gone.' }
}

// ── The report ──────────────────────────────────────────────────────────────

/**
 * Earned, spent, kept — over a range, with the per-café and per-category
 * detail behind each figure.
 *
 * Six statements sent as one, for the same reason the menu query is: a single
 * pg client runs them in sequence whatever the caller does, so five separate
 * awaits cost five round trips, and against Neon from outside its region that
 * is most of a second spent waiting rather than working.
 */
export async function platformFinanceReport({ from, to } = {}) {
  // Re-emitted rather than passed through. Multiple statements cannot carry
  // bound parameters, so these two values are inlined — which makes anything
  // short of a fixed, self-generated format a way to write SQL of one's
  // choosing. Date.toISOString() either produces `2026-08-25T12:00:00.000Z`,
  // which contains no quote and no backslash, or the input was not a date and
  // the bound disappears. Nothing the caller typed reaches the string.
  const bound = (value) => {
    if (!value) return 'NULL'
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? 'NULL' : `'${d.toISOString()}'::timestamptz`
  }
  const lo = bound(from)
  const hi = bound(to)
  const within = (col) => `(${lo} IS NULL OR ${col} >= ${lo}) AND (${hi} IS NULL OR ${col} <= ${hi})`

  const client = await pool.connect()
  try {
    const [received, byCafe, spent, byCategory, cafes, prices] = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n
         FROM platform_payments WHERE ${within('received_at')};

       SELECT tenant_id, MAX(tenant_name) AS tenant_name,
              COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n,
              MAX(received_at) AS last_at
         FROM platform_payments WHERE ${within('received_at')}
        GROUP BY tenant_id ORDER BY total DESC;

       SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n,
              COALESCE(SUM(amount) FILTER (WHERE recurring), 0) AS recurring_total
         FROM platform_expenses WHERE ${within('spent_at')};

       SELECT category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n
         FROM platform_expenses WHERE ${within('spent_at')}
        GROUP BY category ORDER BY total DESC;

       SELECT id, name, slug, status, plan, monthly_price FROM tenants ORDER BY name;

       SELECT plan, monthly_price FROM plan_prices`,
    )

    const planPrices = {}
    for (const r of prices.rows) planPrices[r.plan] = money(r.monthly_price)

    const paidByTenant = new Map()
    for (const r of byCafe.rows) {
      paidByTenant.set(r.tenant_id, { total: money(r.total), payments: Number(r.n), lastAt: iso(r.last_at) })
    }

    // Every café that is meant to be paying, whether or not it has. A café
    // that paid nothing is the one worth seeing, and grouping by payment would
    // have left it out of its own report.
    const perCafe = cafes.rows.map((r) => {
      const paid = paidByTenant.get(r.id)
      return {
        tenantId: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        plan: r.plan,
        monthlyPrice: monthlyPriceOf({ plan: r.plan, monthlyPrice: r.monthly_price }, planPrices),
        paid: paid?.total ?? 0,
        payments: paid?.payments ?? 0,
        lastPaidAt: paid?.lastAt ?? null,
      }
    }).sort((a, b) => b.paid - a.paid || a.name.localeCompare(b.name))

    const earned = money(received.rows[0].total)
    const spentTotal = money(spent.rows[0].total)

    // What the platform bills in a month if everybody who is meant to pay
    // does. Only cafés that can actually use the product count: a suspended
    // café is not billed, and a trial is not paying yet.
    const runRate = perCafe
      .filter((c) => c.status === 'active' || c.status === 'restricted')
      .reduce((s, c) => s + c.monthlyPrice, 0)

    return {
      range: { from: from ?? null, to: to ?? null },
      earned,
      paymentCount: Number(received.rows[0].n),
      spent: spentTotal,
      expenseCount: Number(spent.rows[0].n),
      recurringSpend: money(spent.rows[0].recurring_total),
      profit: earned - spentTotal,
      runRate,
      planPrices,
      perCafe,
      byCategory: byCategory.rows.map((r) => ({
        category: r.category, total: money(r.total), count: Number(r.n),
      })),
    }
  } finally {
    client.release()
  }
}
