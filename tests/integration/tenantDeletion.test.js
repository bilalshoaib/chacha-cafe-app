/**
 * Deleting a café through the platform console.
 *
 * The thing being pinned down is that "delete all of its data" means exactly
 * that — every table the café touched comes back empty — while the two records
 * the schema was built to keep survive: the platform's own note of what the
 * café paid it, and the audit trail. Enforced by SQL (foreign keys, some with
 * ON DELETE CASCADE and some deliberately without), so it cannot be checked
 * without a real database.
 *
 * Runs under `npm run test:integration`. Point DATABASE_URL at a staging
 * branch: it creates its own café and removes it again.
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
const { createTenant, deleteTenant, getTenant } =
  await import('../../lib/repositories/tenantsRepository.js')
const { recordAudit, listAuditForTenant } = await import('../../lib/audit.js')

const stray = []

async function makeCafe() {
  const result = await createTenant({
    name: 'Doomed Coffee', slug: `integration-delete-${Date.now()}`,
    ownerEmail: `t${Date.now()}-owner@integration-delete.invalid`,
    starterMenu: 'cafe', plan: 'trial',
  })
  assert.ok(!result.error, result.error)
  stray.push(result.tenant.id)
  return result
}

/** The tenant-scoped tables the café should have nothing left in afterwards. */
const SCOPED = [
  'locations', 'brands', 'memberships', 'categories', 'tenant_logos',
  'menu_items', 'deals', 'deal_includes', 'deal_splits', 'invoices', 'expenses',
  'users', 'tax_rates', 'shift_closes', 'tabs',
]

after(async () => {
  // Anything a failed test left behind.
  for (const id of stray) {
    for (const t of SCOPED) {
      await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [id]).catch(() => {})
    }
    await pool.query('UPDATE platform_payments SET tenant_id = NULL WHERE tenant_id = $1', [id]).catch(() => {})
    await pool.query('DELETE FROM tenants WHERE id = $1', [id]).catch(() => {})
    await pool.query("DELETE FROM audit_log WHERE tenant_id = $1", [id]).catch(() => {})
  }
  await pool.end()
})

test('a deleted café leaves nothing behind in any of its tables', async () => {
  const { tenant } = await makeCafe()

  // A menu item, a sale, an expense, a tax rate and an open tab, so there is
  // something in the tables that carry no ON DELETE CASCADE to the tenant.
  await pool.query(
    `INSERT INTO menu_items (id, tenant_id, name, price) VALUES ($1, $2, 'Flat White', 4)`,
    [`itm-del-${Date.now()}`, tenant.id],
  )
  await pool.query(
    `INSERT INTO invoices (id, tenant_id, subtotal, total, paid) VALUES ($1, $2, 5, 5, true)`,
    [`inv-del-${Date.now()}`, tenant.id],
  )
  await pool.query(
    `INSERT INTO expenses (id, tenant_id, title, amount, spent_at) VALUES ($1, $2, 'Milk', 3, NOW())`,
    [`exp-del-${Date.now()}`, tenant.id],
  )
  await pool.query(
    `INSERT INTO tax_rates (id, tenant_id, name, rate) VALUES ($1, $2, 'GST', 5)`,
    [`tax-del-${Date.now()}`, tenant.id],
  )
  await pool.query(
    `INSERT INTO tabs (id, tenant_id, label) VALUES ($1, $2, 'Table 1')`,
    [`tab-del-${Date.now()}`, tenant.id],
  )

  const result = await deleteTenant(tenant.id)
  assert.ok(!result.error, result.error)
  assert.equal(result.name, 'Doomed Coffee')

  assert.equal(await getTenant(tenant.id), null, 'the café itself is gone')
  for (const table of SCOPED) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [tenant.id])
    assert.equal(rows[0].n, 0, `${table} still has rows for the deleted café`)
  }
})

test('what the café paid the platform is kept, with the link dropped', async () => {
  const { tenant } = await makeCafe()

  const payId = `pay-del-${Date.now()}`
  await pool.query(
    `INSERT INTO platform_payments (id, tenant_id, tenant_name, amount, received_at)
     VALUES ($1, $2, $3, 40, NOW())`,
    [payId, tenant.id, tenant.name],
  )

  await deleteTenant(tenant.id)

  const { rows } = await pool.query(
    'SELECT tenant_id, tenant_name, amount FROM platform_payments WHERE id = $1', [payId])
  assert.equal(rows.length, 1, 'the payment row survives the café')
  assert.equal(rows[0].tenant_id, null, 'but no longer points at a café that is gone')
  assert.equal(rows[0].tenant_name, 'Doomed Coffee', 'the name copied onto it is how it is still identified')

  await pool.query('DELETE FROM platform_payments WHERE id = $1', [payId])
})

test('the audit trail outlives the café it describes', async () => {
  const { tenant } = await makeCafe()

  // Recorded the way the route records it: by the platform owner, who belongs
  // to no tenant and so is not among the users the delete removes.
  const actor = await pool.query("SELECT id, email FROM users WHERE tenant_id IS NULL LIMIT 1")
  assert.ok(actor.rows.length, 'a platform-level user exists to act as')
  await recordAudit({
    actorId: actor.rows[0].id, actorEmail: actor.rows[0].email,
    tenantId: tenant.id, tenantName: tenant.name,
    action: 'tenant_deleted', detail: 'Deleted this café and all of its data.',
  })

  await deleteTenant(tenant.id)

  const trail = await listAuditForTenant(tenant.id)
  assert.ok(trail.some((e) => e.action === 'tenant_deleted'), 'the deletion is still on the record')

  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [tenant.id])
})

test('deleting a café that is already gone is reported, not thrown', async () => {
  const result = await deleteTenant('t-never-existed')
  assert.match(result.error ?? '', /no longer exists/)
})
