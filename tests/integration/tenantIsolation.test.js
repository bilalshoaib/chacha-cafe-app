/**
 * Proves one café cannot read or write another's rows.
 *
 * Needs a database, so it lives apart from the unit tests and runs under
 * `npm run test:integration`. Point DATABASE_URL at a staging branch — it
 * creates a second tenant, works against it, and removes it again.
 *
 * This is the test the whole isolation design exists to pass. If it ever goes
 * red, two customers are sharing a view of each other's takings.
 */
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// The app reads env through Next; a bare test runner has to load it itself.
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
}

const { pool } = await import('../../lib/db.js')
const { findInvoices, countInvoices, getInvoiceById, saveInvoice } = await import('../../lib/repositories/invoicesRepository.js')
const { findExpenses, getExpenseById, saveExpenses, deleteExpenseById } = await import('../../lib/repositories/expensesRepository.js')

const OTHER = 't-test-isolation'
const otherCtx = { tenantId: OTHER, userId: 'usr-test', role: 'super_admin' }
let hostCtx

before(async () => {
  const host = await pool.query(`SELECT id FROM tenants WHERE id <> $1 ORDER BY created_at LIMIT 1`, [OTHER])
  assert.ok(host.rows[0], 'the database needs at least one real tenant to test against')
  hostCtx = { tenantId: host.rows[0].id, userId: 'usr-test', role: 'super_admin' }

  await pool.query(
    `INSERT INTO tenants (id, slug, name) VALUES ($1, 'test-isolation', 'Isolation Test Cafe')
     ON CONFLICT (id) DO NOTHING`, [OTHER])
  await pool.query(
    `INSERT INTO locations (id, tenant_id, name, code) VALUES ('loc-test-isolation', $1, 'Test', 'TEST')
     ON CONFLICT (id) DO NOTHING`, [OTHER])
})

after(async () => {
  await pool.query('DELETE FROM invoices WHERE tenant_id = $1', [OTHER])
  await pool.query('DELETE FROM expenses WHERE tenant_id = $1', [OTHER])
  await pool.query('DELETE FROM locations WHERE tenant_id = $1', [OTHER])
  await pool.query('DELETE FROM tenants WHERE id = $1', [OTHER])
  await pool.end()
})

test('a new tenant sees none of the existing tenant\'s invoices', async () => {
  assert.equal(await countInvoices(otherCtx), 0)
  assert.deepEqual(await findInvoices(otherCtx), [])
  assert.ok(await countInvoices(hostCtx) > 0, 'the host tenant should have invoices to hide')
})

test('an invoice written by one tenant is invisible to the other', async () => {
  await saveInvoice(otherCtx, {
    id: 'inv-isolation-test-1', businessType: 'cafe', lines: [],
    subtotal: 99, total: 99, locationId: 'loc-test-isolation',
    createdAt: new Date().toISOString(),
  })
  assert.equal(await countInvoices(otherCtx), 1)
  assert.ok(await getInvoiceById(otherCtx, 'inv-isolation-test-1'), 'its owner can read it')
  assert.equal(await getInvoiceById(hostCtx, 'inv-isolation-test-1'), null, 'the other tenant cannot')
})

test('expenses are isolated the same way', async () => {
  await saveExpenses(otherCtx, [{
    id: 'e-isolation-test-1', title: 'Test', amount: 50, category: 'other',
    businessType: 'cafe', spentAt: new Date().toISOString(), locationId: 'loc-test-isolation',
  }])
  assert.equal((await findExpenses(otherCtx)).length, 1)
  assert.equal(await getExpenseById(hostCtx, 'e-isolation-test-1'), null)
  const hostExpenses = await findExpenses(hostCtx)
  assert.ok(!hostExpenses.some((e) => e.id === 'e-isolation-test-1'))
})

test('one tenant cannot delete another\'s row', async () => {
  assert.equal(await deleteExpenseById(hostCtx, 'e-isolation-test-1'), false, 'the delete must not match')
  assert.ok(await getExpenseById(otherCtx, 'e-isolation-test-1'), 'and the row must survive')
  assert.equal(await deleteExpenseById(otherCtx, 'e-isolation-test-1'), true, 'its owner can delete it')
})

test('a missing tenant is refused rather than treated as no filter', async () => {
  for (const bad of [{}, { tenantId: null }, { tenantId: '' }, undefined]) {
    await assert.rejects(() => countInvoices(bad), /requires a tenantId/,
      `${JSON.stringify(bad)} must not be allowed to query`)
  }
})

test('row level security is enforced, not merely enabled', async () => {
  // The failure this guards against is subtle: ENABLE ROW LEVEL SECURITY on a
  // table whose owner holds BYPASSRLS leaves the policies switched on and
  // completely inert, which reads like protection in every schema dump.
  const { rows } = await pool.query(`
    SELECT c.relname, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
           (SELECT COUNT(*)::int FROM pg_policies p WHERE p.tablename = c.relname) AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('menu_items','deals','deal_includes','invoices','expenses')`)
  assert.equal(rows.length, 5, 'all five data tables must be present')
  for (const r of rows) {
    assert.ok(r.enabled, `${r.relname} has RLS enabled`)
    assert.ok(r.forced, `${r.relname} forces RLS on its owner`)
    assert.equal(r.policies, 1, `${r.relname} has exactly one policy`)
  }

  const role = await pool.query(`SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_tenant'`)
  assert.ok(role.rows[0], 'app_tenant must exist')
  assert.equal(role.rows[0].rolbypassrls, false,
    'app_tenant must not bypass RLS — that attribute is what made the first attempt inert')
})

test('the policy refuses a write into another tenant', async () => {
  const { withTenant } = await import('../../lib/db.js')
  await pool.query(
    `INSERT INTO tenants (id, slug, name) VALUES ('t-rls-probe','rls-probe','RLS Probe')
     ON CONFLICT (id) DO NOTHING`)
  try {
    await assert.rejects(
      () => withTenant(otherCtx, (client) => client.query(
        `INSERT INTO expenses (id, title, amount, category, business_type, note, spent_at, created_at, tenant_id)
         VALUES ('e-rls-probe','probe',1,'other','cafe','',NOW(),NOW(),'t-rls-probe')`)),
      /row-level security/,
      'WITH CHECK must stop a row being written into a tenant other than the declared one')
  } finally {
    await pool.query(`DELETE FROM tenants WHERE id = 't-rls-probe'`)
  }
})
