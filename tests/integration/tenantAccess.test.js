/**
 * Whether a café may be used, all the way down to the row.
 *
 * The unit tests next door pin the rule itself; this pins the plumbing around
 * it — that the console's writes land in the columns the rule reads, that the
 * cache in front of those reads cannot serve a stale "yes" after a café has
 * been stopped, and that restoring a café whose trial ran out actually puts
 * time back on the clock rather than merely setting a status it already had.
 *
 * Run against a scratch database: `npm run test:integration`.
 */
import test, { after } from 'node:test'
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
const {
  createTenant, getTenant, updateTenant, getTenantAccess, isTenantActive, forgetTenantAccess,
} = await import('../../lib/repositories/tenantsRepository.js')
const { TRIAL_DAYS_DEFAULT, TRIAL_DAYS_MAX } = await import('../../lib/tenantAccess.js')

const created = []

async function makeCafe(overrides = {}) {
  const unique = `${Date.now()}-${created.length}`
  const result = await createTenant({
    name: 'Access Test Cafe',
    slug: `access-test-${unique}`,
    ownerEmail: `owner-${unique}@access-test-cafe.invalid`,
    starterMenu: 'cafe',
    ...overrides,
  })
  assert.ok(!result.error, result.error)
  created.push(result.tenant.id)
  return result
}

/** Moves a café's trial end without going through updateTenant. */
async function setTrialEnd(id, iso) {
  await pool.query('UPDATE tenants SET trial_ends_at = $2 WHERE id = $1', [id, iso])
  forgetTenantAccess(id)
}

after(async () => {
  for (const id of created) {
    for (const t of ['tenant_logos', 'memberships', 'users', 'categories', 'brands', 'locations']) {
      await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [id])
    }
    await pool.query('DELETE FROM tenants WHERE id = $1', [id])
  }
  await pool.end()
})

test('a café created on trial gets a clock, and one on a paid plan does not', async () => {
  const { tenant: trial } = await makeCafe({ plan: 'trial' })
  assert.equal(trial.status, 'trial')
  assert.ok(trial.trialEndsAt, 'a trial without an end date is not a trial')
  const days = (new Date(trial.trialEndsAt) - Date.now()) / 86_400_000
  assert.ok(Math.abs(days - TRIAL_DAYS_DEFAULT) < 0.01, `expected ~${TRIAL_DAYS_DEFAULT} days, got ${days}`)

  const { tenant: paid } = await makeCafe({ plan: 'standard' })
  assert.equal(paid.status, 'active')
  assert.equal(paid.trialEndsAt, null)
})

test('a trial length can be chosen at creation, and a silly one is refused', async () => {
  const { tenant } = await makeCafe({ plan: 'trial', trialDays: 3 })
  const days = (new Date(tenant.trialEndsAt) - Date.now()) / 86_400_000
  assert.ok(Math.abs(days - 3) < 0.01)

  const unique = `${Date.now()}-bad`
  const bad = await createTenant({
    name: 'Nope', slug: `access-bad-${unique}`,
    ownerEmail: `nope-${unique}@access-test-cafe.invalid`,
    plan: 'trial', trialDays: TRIAL_DAYS_MAX + 1,
  })
  assert.ok(bad.error, 'an out-of-range trial length should be refused, not clamped')
  assert.match(bad.error, /trial length/i)
})

test('a café stops being allowed the moment its trial runs out', async () => {
  const { tenant } = await makeCafe({ plan: 'trial', trialDays: 30 })
  assert.equal(await isTenantActive(tenant.id), true)

  await setTrialEnd(tenant.id, new Date(Date.now() - 1000).toISOString())
  const access = await getTenantAccess(tenant.id)
  assert.equal(access.allowed, false)
  assert.equal(access.reason, 'trial_expired')
})

test('pausing for payment blocks the café and keeps the reason it is shown', async () => {
  const { tenant } = await makeCafe({ plan: 'standard' })
  assert.equal(await isTenantActive(tenant.id), true)

  const res = await updateTenant(tenant.id, {
    status: 'restricted',
    restrictedReason: 'Invoice #41 is 21 days overdue',
  })
  assert.ok(!res.error, res.error)
  assert.equal(res.tenant.status, 'restricted')
  assert.ok(res.tenant.restrictedAt, 'the moment it was paused is recorded')

  // No forgetTenantAccess() here on purpose: updateTenant must drop the cache
  // itself, or the console would appear to do nothing for fifteen seconds.
  const access = await getTenantAccess(tenant.id)
  assert.equal(access.allowed, false)
  assert.equal(access.reason, 'restricted')
  assert.match(access.message, /Invoice #41 is 21 days overdue/)
})

test('restoring a café clears the pause and the note that explained it', async () => {
  const { tenant } = await makeCafe({ plan: 'standard' })
  await updateTenant(tenant.id, { status: 'restricted', restrictedReason: 'Card declined' })

  const res = await updateTenant(tenant.id, { status: 'active' })
  assert.ok(!res.error, res.error)
  assert.equal(res.tenant.status, 'active')
  assert.equal(res.tenant.restrictedAt, null)
  assert.equal(res.tenant.restrictedReason, null, 'a café let back in should not still carry why it was stopped')
  assert.equal((await getTenantAccess(tenant.id)).allowed, true)
})

test('restoring an expired trial with a new length lets them back in', async () => {
  const { tenant } = await makeCafe({ plan: 'trial', trialDays: 2 })
  await setTrialEnd(tenant.id, new Date(Date.now() - 1000).toISOString())
  assert.equal(await isTenantActive(tenant.id), false)

  const res = await updateTenant(tenant.id, { status: 'trial', trialDays: 7 })
  assert.ok(!res.error, res.error)
  assert.equal((await getTenantAccess(tenant.id)).allowed, true)
  const days = (new Date(res.tenant.trialEndsAt) - Date.now()) / 86_400_000
  assert.ok(Math.abs(days - 7) < 0.01)
})

test('moving an expired trial onto a paid plan lets them back in', async () => {
  const { tenant } = await makeCafe({ plan: 'trial', trialDays: 2 })
  await setTrialEnd(tenant.id, new Date(Date.now() - 1000).toISOString())

  const res = await updateTenant(tenant.id, { status: 'active', plan: 'standard' })
  assert.ok(!res.error, res.error)
  assert.equal((await getTenantAccess(tenant.id)).allowed, true, 'the stale trial date must not follow them onto a paid plan')
})

test('suspension still blocks, and outranks a trial with time left', async () => {
  const { tenant } = await makeCafe({ plan: 'trial', trialDays: 90 })
  await updateTenant(tenant.id, { status: 'suspended' })
  const access = await getTenantAccess(tenant.id)
  assert.equal(access.allowed, false)
  assert.equal(access.reason, 'suspended')
})

test('a café that no longer exists is refused, not waved through', async () => {
  assert.equal(await isTenantActive('t-does-not-exist'), false)
})

test('an unknown status is refused by updateTenant', async () => {
  const { tenant } = await makeCafe({ plan: 'standard' })
  const res = await updateTenant(tenant.id, { status: 'whatever' })
  assert.ok(res.error)
  assert.match(res.error, /Status must be one of/)
})
