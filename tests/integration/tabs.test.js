/**
 * Open tabs, against a real database.
 *
 * Two of the three things that make a tab trustworthy cannot be tested without
 * one, because both are enforced by SQL rather than by JavaScript: the version
 * check that stops one server erasing another's round, and the row level
 * security that stops one café seeing another's tables. The third — that a tab
 * is closed once — is a guarded UPDATE for the same reason.
 *
 * Runs under `npm run test:integration`. Point DATABASE_URL at a staging
 * branch: it creates its own tenant and removes it again.
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
const {
  listOpenTabs, openTab, getTab, updateTab, markTabInvoiced, abandonTab,
} = await import('../../lib/repositories/tabsRepository.js')

const MINE = 't-test-tabs'
const THEIRS = 't-test-tabs-other'
const myCtx = { tenantId: MINE, userId: 'usr-test', role: 'super_admin' }
const theirCtx = { tenantId: THEIRS, userId: 'usr-test', role: 'super_admin' }

async function makeTenant(id, slug) {
  await pool.query(
    `INSERT INTO tenants (id, slug, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
    [id, slug, `Tab Test ${slug}`])
  await pool.query(
    `INSERT INTO locations (id, tenant_id, name, code) VALUES ($1, $2, 'Test', 'TEST')
     ON CONFLICT (id) DO NOTHING`, [`loc-${id}`, id])
}

before(async () => {
  await makeTenant(MINE, 'test-tabs')
  await makeTenant(THEIRS, 'test-tabs-other')
})

after(async () => {
  for (const id of [MINE, THEIRS]) {
    await pool.query('DELETE FROM tabs WHERE tenant_id = $1', [id])
    await pool.query('DELETE FROM locations WHERE tenant_id = $1', [id])
    await pool.query('DELETE FROM tenants WHERE id = $1', [id])
  }
  await pool.end()
})

const line = (qty = 1) => ({ kind: 'item', refId: 'i-1', qty, unitPrice: 5, lineTotal: 5 * qty })

test('a tab opens with a name and nothing on it', async () => {
  const tab = await openTab(myCtx, { label: 'Table 4', shiftDate: '2026-08-30' })
  assert.equal(tab.label, 'Table 4')
  assert.equal(tab.status, 'open')
  assert.deepEqual(tab.lines, [])
  assert.equal(tab.version, 1)
  assert.equal(tab.shiftDate, '2026-08-30')
})

test('adding to a tab moves its version on', async () => {
  const tab = await openTab(myCtx, { label: 'Table 5' })
  const { tab: updated } = await updateTab(myCtx, tab.id, {
    lines: [line(2)], expectedVersion: tab.version,
  })
  assert.equal(updated.version, tab.version + 1)
  assert.equal(updated.lines.length, 1)
  assert.equal(updated.lines[0].qty, 2)
})

test('a write from a stale version is refused, and changes nothing', async () => {
  // The failure this exists to prevent: two servers with the same tab on
  // screen, and the second one's save silently deleting the round the first
  // just added.
  const tab = await openTab(myCtx, { label: 'Table 6' })
  const { tab: afterFirst } = await updateTab(myCtx, tab.id, {
    lines: [line(3)], expectedVersion: tab.version,
  })

  const second = await updateTab(myCtx, tab.id, { lines: [], expectedVersion: tab.version })
  assert.equal(second.conflict, true)
  assert.equal(second.tab.version, afterFirst.version, 'the version did not move')
  assert.equal(second.tab.lines.length, 1, 'the first writer\'s round is still there')

  const reread = await getTab(myCtx, tab.id)
  assert.equal(reread.lines[0].qty, 3)
})

test('a write at the current version succeeds after a conflict', async () => {
  // The recovery path: having been told, the second writer re-reads and tries
  // again. That has to work, or a conflicted tab is stuck forever.
  const tab = await openTab(myCtx, { label: 'Table 7' })
  await updateTab(myCtx, tab.id, { lines: [line()], expectedVersion: tab.version })
  const current = await getTab(myCtx, tab.id)
  const { tab: ok } = await updateTab(myCtx, tab.id, {
    lines: [line(), line()], expectedVersion: current.version,
  })
  assert.equal(ok.lines.length, 2)
})

test('a tab is rung up once', async () => {
  const tab = await openTab(myCtx, { label: 'Table 8' })
  const closed = await markTabInvoiced(myCtx, tab.id, 'inv-test-1')
  assert.equal(closed.status, 'invoiced')
  assert.equal(closed.invoiceId, 'inv-test-1')
  assert.ok(closed.closedAt)

  // The second device gets nothing back, which is how the checkout route knows
  // its invoice is a duplicate before it hands anybody a receipt.
  assert.equal(await markTabInvoiced(myCtx, tab.id, 'inv-test-2'), null)
  assert.equal((await getTab(myCtx, tab.id)).invoiceId, 'inv-test-1')
})

test('an invoiced tab cannot be edited', async () => {
  const tab = await openTab(myCtx, { label: 'Table 10' })
  await markTabInvoiced(myCtx, tab.id, 'inv-test-3')
  const res = await updateTab(myCtx, tab.id, { lines: [line()], expectedVersion: 2 })
  assert.equal(res.conflict, true)
  assert.equal(res.tab.status, 'invoiced')
})

test('an abandoned tab is kept, not deleted', async () => {
  // "Table six left without paying" is exactly what a manager wants a record
  // of, so it must still be there to ask about.
  const tab = await openTab(myCtx, { label: 'Table 11' })
  const gone = await abandonTab(myCtx, tab.id)
  assert.equal(gone.status, 'abandoned')
  assert.ok(await getTab(myCtx, tab.id), 'the row is still there')
  assert.equal(await abandonTab(myCtx, tab.id), null, 'and cannot be abandoned twice')
})

test('only open tabs are listed', async () => {
  const before = await listOpenTabs(myCtx)
  const tab = await openTab(myCtx, { label: 'Table 12' })
  assert.equal((await listOpenTabs(myCtx)).length, before.length + 1)
  await markTabInvoiced(myCtx, tab.id, 'inv-test-4')
  assert.equal((await listOpenTabs(myCtx)).length, before.length)
})

test('one café cannot see or touch another\'s tabs', async () => {
  // The claim the whole isolation design exists to make. If this goes red, one
  // café's staff are looking at another's tables.
  const mine = await openTab(myCtx, { label: 'Private Table' })

  assert.equal(await getTab(theirCtx, mine.id), null, 'the other café cannot read it')
  assert.deepEqual(
    (await listOpenTabs(theirCtx)).filter((t) => t.id === mine.id), [],
    'nor see it in their list',
  )

  const write = await updateTab(theirCtx, mine.id, { lines: [line()], expectedVersion: mine.version })
  assert.equal(write.missing, true, 'nor write to it')
  assert.equal(await markTabInvoiced(theirCtx, mine.id, 'inv-theirs'), null, 'nor close it')
  assert.equal(await abandonTab(theirCtx, mine.id), null, 'nor abandon it')

  const still = await getTab(myCtx, mine.id)
  assert.equal(still.status, 'open')
  assert.equal(still.lines.length, 0)
})

test('a label is trimmed and capped rather than overflowing the column', async () => {
  const tab = await openTab(myCtx, { label: `  ${'x'.repeat(200)}  ` })
  assert.equal(tab.label.length, 60)
})
