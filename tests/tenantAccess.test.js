import test from 'node:test'
import assert from 'node:assert/strict'
import {
  tenantAccess,
  trialDaysLeft,
  trialEndFromDays,
  TRIAL_DAYS_MAX,
} from '../lib/tenantAccess.js'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 7, 25, 12, 0, 0)
const inDays = (n) => new Date(NOW + n * DAY).toISOString()

test('an active café is allowed', () => {
  assert.equal(tenantAccess({ status: 'active' }, NOW).allowed, true)
})

test('a trial with time left is allowed', () => {
  const a = tenantAccess({ status: 'trial', trialEndsAt: inDays(3) }, NOW)
  assert.equal(a.allowed, true)
  assert.equal(a.reason, null)
})

test('a trial is blocked the instant it ends, not the day after', () => {
  assert.equal(tenantAccess({ status: 'trial', trialEndsAt: inDays(0) }, NOW).allowed, false)
  assert.equal(tenantAccess({ status: 'trial', trialEndsAt: new Date(NOW - 1).toISOString() }, NOW).reason, 'trial_expired')
  assert.equal(tenantAccess({ status: 'trial', trialEndsAt: new Date(NOW + 1).toISOString() }, NOW).allowed, true)
})

test('a trial with no end date runs unlimited', () => {
  // Every café predating the trial clock is in this state, and the migration
  // must not be what locks them out.
  assert.equal(tenantAccess({ status: 'trial', trialEndsAt: null }, NOW).allowed, true)
})

test('an expired trial date does not block a café that has been moved off trial', () => {
  assert.equal(tenantAccess({ status: 'active', trialEndsAt: inDays(-30) }, NOW).allowed, true)
})

test('a restricted café is blocked and shown the reason given', () => {
  const a = tenantAccess({ status: 'restricted', restrictedReason: 'Invoice #41 is 21 days overdue' }, NOW)
  assert.equal(a.allowed, false)
  assert.equal(a.reason, 'restricted')
  assert.match(a.message, /Invoice #41 is 21 days overdue/)
})

test('a restricted café with no reason still gets a usable message', () => {
  const a = tenantAccess({ status: 'restricted' }, NOW)
  assert.equal(a.allowed, false)
  assert.match(a.message, /payment/i)
})

test('suspension outranks everything else', () => {
  const a = tenantAccess({ status: 'suspended', trialEndsAt: inDays(90) }, NOW)
  assert.equal(a.allowed, false)
  assert.equal(a.reason, 'suspended')
})

test('a café that cannot be found is refused, never waved through', () => {
  assert.equal(tenantAccess(null, NOW).allowed, false)
  assert.equal(tenantAccess(undefined, NOW).allowed, false)
})

test('days left rounds up, so a trial with hours on it does not read as zero', () => {
  assert.equal(trialDaysLeft({ status: 'trial', trialEndsAt: inDays(3.2) }, NOW), 4)
  assert.equal(trialDaysLeft({ status: 'trial', trialEndsAt: new Date(NOW + 60_000).toISOString() }, NOW), 1)
  assert.equal(trialDaysLeft({ status: 'trial', trialEndsAt: inDays(-2) }, NOW), 0)
})

test('days left is null for a café that is not on a trial', () => {
  assert.equal(trialDaysLeft({ status: 'active', trialEndsAt: inDays(5) }, NOW), null)
  assert.equal(trialDaysLeft({ status: 'trial', trialEndsAt: null }, NOW), null)
})

test('a trial length must be a whole number of days within range', () => {
  assert.ok(trialEndFromDays(14).value)
  assert.ok(trialEndFromDays(TRIAL_DAYS_MAX).value)
  for (const bad of [0, -1, 1.5, TRIAL_DAYS_MAX + 1, 'soon', null, undefined, NaN, Infinity]) {
    assert.ok(trialEndFromDays(bad).error, `${bad} should be refused`)
  }
})

test('a trial length of n days lands n days out', () => {
  const before = Date.now()
  const { value } = trialEndFromDays(14)
  const ms = new Date(value).getTime() - before
  assert.ok(Math.abs(ms - 14 * DAY) < 5_000)
})
