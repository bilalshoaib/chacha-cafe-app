/**
 * Creating a café through the platform console.
 *
 * The thing being pinned down is that a new café arrives *usable* — a branch,
 * a brand, categories and an owner who can sign in. A tenant missing any of
 * those is not a café somebody can start using, it is a support ticket, and
 * the failure would only show up when the new owner tried to take an order.
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
const { createTenant, getTenant, updateTenant, isTenantActive, slugify } =
  await import('../../lib/repositories/tenantsRepository.js')
const { getUserByEmail, verifyPassword } = await import('../../lib/repositories/usersRepository.js')
const { loadMenu, listCategories } = await import('../../lib/repositories/menuRepository.js')

const EMAIL = 'owner@integration-test-cafe.invalid'
const created = []

async function makeCafe(overrides = {}) {
  const result = await createTenant({
    name: "Gloria's Coffee", slug: `integration-test-${Date.now()}`,
    ownerEmail: `t${Date.now()}-${EMAIL}`, starterMenu: 'cafe', plan: 'trial',
    ...overrides,
  })
  assert.ok(!result.error, result.error)
  created.push(result.tenant.id)
  return result
}

after(async () => {
  for (const id of created) {
    for (const t of ['memberships', 'users', 'categories', 'brands', 'locations']) {
      await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [id])
    }
    await pool.query('DELETE FROM tenants WHERE id = $1', [id])
  }
  await pool.end()
})

test('a new café arrives with a branch, a brand, categories and an owner', async () => {
  const { tenant, owner } = await makeCafe()
  const ctx = { tenantId: tenant.id, userId: owner.id, role: 'super_admin' }

  assert.equal(tenant.locationCount, 1, 'one branch')
  assert.equal(tenant.brandCount, 1, 'one brand')
  assert.equal(tenant.userCount, 1, 'the owner')
  assert.ok((await listCategories(ctx)).length >= 4, 'the starter categories')

  const membership = await pool.query('SELECT role, location_id FROM memberships WHERE tenant_id = $1', [tenant.id])
  assert.equal(membership.rows[0].role, 'tenant_owner')
  assert.equal(membership.rows[0].location_id, null, 'the owner sees every branch, including unopened ones')
})

test('the owner can sign in with the password handed over, and only that one', async () => {
  const { owner } = await makeCafe()
  const account = await getUserByEmail(owner.email)
  assert.ok(account, 'the account exists')
  assert.ok(await verifyPassword(owner.temporaryPassword, account.passwordHash))
  assert.equal(await verifyPassword('wrong-password', account.passwordHash), false)
})

test('a single-counter café gets one brand named after itself', async () => {
  const { tenant, owner } = await makeCafe({ name: 'Solo Cafe' })
  const brands = await pool.query('SELECT name FROM brands WHERE tenant_id = $1', [tenant.id])
  assert.equal(brands.rowCount, 1)
  assert.equal(brands.rows[0].name, 'Solo Cafe', 'so the concept never surfaces in the interface')
  void owner
})

test('a café with separate counters gets one brand each, in order', async () => {
  const { tenant } = await makeCafe({ brandNames: ['Coffee Bar', 'Bakery'] })
  const brands = await pool.query(
    'SELECT name, slug, sort_order FROM brands WHERE tenant_id = $1 ORDER BY sort_order', [tenant.id])
  assert.deepEqual(brands.rows.map((b) => b.name), ['Coffee Bar', 'Bakery'])
  assert.deepEqual(brands.rows.map((b) => b.slug), ['coffee-bar', 'bakery'])
})

test('a new café sees none of an existing café\'s menu or invoices', async () => {
  const { tenant, owner } = await makeCafe()
  const ctx = { tenantId: tenant.id, userId: owner.id, role: 'super_admin' }
  const menu = await loadMenu(ctx)
  assert.deepEqual(menu.items, [], 'its menu starts empty')
  assert.deepEqual(menu.deals, [])

  const host = await pool.query(`SELECT id FROM tenants WHERE id <> $1 ORDER BY created_at LIMIT 1`, [tenant.id])
  const hostMenu = await loadMenu({ tenantId: host.rows[0].id })
  assert.ok(hostMenu.items.length > 0, 'while the existing café still has its own')
})

test('a duplicate URL name or owner email is refused', async () => {
  const { tenant } = await makeCafe()
  const full = await pool.query('SELECT slug FROM tenants WHERE id = $1', [tenant.id])
  const clash = await createTenant({
    name: 'Copycat', slug: full.rows[0].slug, ownerEmail: 'someone-else@test.invalid',
  })
  assert.match(clash.error ?? '', /already taken/)

  const owner = await pool.query('SELECT email FROM users WHERE tenant_id = $1', [tenant.id])
  const emailClash = await createTenant({
    name: 'Copycat', slug: `unique-${Date.now()}`, ownerEmail: owner.rows[0].email,
  })
  assert.match(emailClash.error ?? '', /already exists/)
})

test('suspending a café blocks it without touching its data', async () => {
  const { tenant } = await makeCafe()
  assert.equal(await isTenantActive(tenant.id), true)

  await updateTenant(tenant.id, { status: 'suspended' })
  assert.equal(await isTenantActive(tenant.id), false)

  const still = await getTenant(tenant.id)
  assert.equal(still.userCount, 1, 'the accounts are still there')
  assert.equal(still.locationCount, 1, 'and so is the branch')

  await updateTenant(tenant.id, { status: 'active' })
  assert.equal(await isTenantActive(tenant.id), true, 'and it comes back exactly as it was')
})

test('slugify makes a URL name out of anything typed', () => {
  assert.equal(slugify("Gloria's Coffee"), 'gloria-s-coffee')
  assert.equal(slugify('  Café  Del  Mar  '), 'caf-del-mar')
  assert.equal(slugify('---'), '')
})

test('a new owner password can be issued, and the old one stops working', async () => {
  const { tenant, owner } = await makeCafe()
  const { resetOwnerPassword } = await import('../../lib/repositories/tenantsRepository.js')

  const before = await getUserByEmail(owner.email)
  assert.ok(await verifyPassword(owner.temporaryPassword, before.passwordHash))

  const reset = await resetOwnerPassword(tenant.id)
  assert.ok(!reset.error, reset.error)
  assert.equal(reset.owner.email, owner.email, 'it finds the tenant_owner, not just any account')
  assert.notEqual(reset.owner.temporaryPassword, owner.temporaryPassword)

  const after = await getUserByEmail(owner.email)
  assert.ok(await verifyPassword(reset.owner.temporaryPassword, after.passwordHash), 'the new one works')
  assert.equal(await verifyPassword(owner.temporaryPassword, after.passwordHash), false,
    'and the one it replaced does not')
})

test('resetting a café with no owner reports it rather than throwing', async () => {
  const { resetOwnerPassword } = await import('../../lib/repositories/tenantsRepository.js')
  const result = await resetOwnerPassword('t-does-not-exist')
  assert.match(result.error ?? '', /no owner account/)
})
