/**
 * Support access to a café's account.
 *
 * The claim being checked is that read-only means read-only. It is enforced by
 * a database role with no write privileges rather than by a check in each
 * route, so the test writes directly through the repositories — the same path
 * a forgotten route guard would take.
 */
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

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
const { findExpenses, saveExpenses, deleteExpenseById } = await import('../../lib/repositories/expensesRepository.js')
const { loadMenu } = await import('../../lib/repositories/menuRepository.js')
const { countInvoices } = await import('../../lib/repositories/invoicesRepository.js')
const { recordAudit, listAuditForTenant } = await import('../../lib/audit.js')

let tenantId, actorId, actorEmail
const EXPENSE = 'e-impersonation-test'

before(async () => {
  const t = await pool.query('SELECT id FROM tenants ORDER BY created_at LIMIT 1')
  tenantId = t.rows[0].id
  const u = await pool.query('SELECT id, email FROM users WHERE tenant_id = $1 LIMIT 1', [tenantId])
  actorId = u.rows[0].id
  actorEmail = u.rows[0].email
})

after(async () => {
  await pool.query('DELETE FROM expenses WHERE id = $1', [EXPENSE])
  await pool.query('DELETE FROM audit_log WHERE actor_id = $1 AND action LIKE $2', [actorId, 'test.%'])
  await pool.end()
})

const readOnlyCtx = () => ({ tenantId, userId: actorId, role: 'super_admin', impersonating: true, readOnly: true })
const controlCtx = () => ({ tenantId, userId: actorId, role: 'super_admin', impersonating: true, readOnly: false })

test('a read-only session can see the café\'s data', async () => {
  const menu = await loadMenu(readOnlyCtx())
  assert.ok(menu.items.length > 0, 'the menu is visible')
  assert.ok(await countInvoices(readOnlyCtx()) > 0, 'and so are the invoices')
})

test('a read-only session cannot write, however it is asked', async () => {
  const expense = {
    id: EXPENSE, title: 'Should never be saved', amount: 1, category: 'other',
    businessType: 'cafe', spentAt: new Date().toISOString(),
  }
  await assert.rejects(
    () => saveExpenses(readOnlyCtx(), [expense]),
    /permission denied/,
    'the database refuses the insert, not a route guard')

  const found = await pool.query('SELECT id FROM expenses WHERE id = $1', [EXPENSE])
  assert.equal(found.rowCount, 0, 'and nothing reached the table')
})

test('a read-only session cannot delete either', async () => {
  const existing = await findExpenses(controlCtx())
  if (!existing.length) return
  await assert.rejects(
    () => deleteExpenseById(readOnlyCtx(), existing[0].id),
    /permission denied/)
  const still = await pool.query('SELECT id FROM expenses WHERE id = $1', [existing[0].id])
  assert.equal(still.rowCount, 1, 'the row survives')
})

test('taking control allows writes again', async () => {
  await saveExpenses(controlCtx(), [{
    id: EXPENSE, title: 'Written with control taken', amount: 1, category: 'other',
    businessType: 'cafe', spentAt: new Date().toISOString(),
  }])
  const found = await pool.query('SELECT title FROM expenses WHERE id = $1', [EXPENSE])
  assert.equal(found.rowCount, 1)
  assert.equal(await deleteExpenseById(controlCtx(), EXPENSE), true)
})

test('read-only still means one café only', async () => {
  // Looking without touching must not become looking at everyone.
  const other = await pool.query('SELECT id FROM tenants WHERE id <> $1 LIMIT 1', [tenantId])
  if (!other.rowCount) return
  const foreign = await loadMenu({ tenantId: other.rows[0].id, readOnly: true })
  const mine = await loadMenu(readOnlyCtx())
  const overlap = foreign.items.filter((f) => mine.items.some((m) => m.id === f.id))
  assert.equal(overlap.length, 0, 'the two cafés share no items')
})

test('the trail records who acted, not who was acted as', async () => {
  await recordAudit({
    actorId, actorEmail, tenantId, tenantName: 'Test',
    action: 'test.impersonation', detail: 'Opened read-only',
  })
  const entries = await listAuditForTenant(tenantId)
  const mine = entries.find((e) => e.action === 'test.impersonation')
  assert.ok(mine, 'the entry is there')
  assert.equal(mine.actorEmail, actorEmail, 'and names the person at the keyboard')
})

test('a failed audit write never takes down the action it describes', async () => {
  // actor_id has a foreign key, so this cannot be stored. It must not throw.
  await recordAudit({
    actorId: 'usr-does-not-exist', actorEmail: 'nobody@test.invalid',
    tenantId, action: 'test.unstorable', detail: 'x',
  })
})
