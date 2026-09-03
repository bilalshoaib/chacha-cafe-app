/**
 * Proves each café's invoices are numbered by that café alone.
 *
 * Needs a database, so it lives apart from the unit tests and runs under
 * `npm run test:integration`. Point DATABASE_URL at a staging branch — it
 * creates two tenants, works against them, and removes them again.
 *
 * The bug this pins down shipped: every café drew from one global sequence, so
 * a sale here took inv-200 and a sale ringing up in another café at the same
 * moment took inv-201. Neither café's invoices counted 1, 2, 3. It could only
 * be caught with two cafés and a real counter, which is why it is here rather
 * than in a unit test.
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
const { nextInvoiceNumber, reserveInvoiceNumbers, saveInvoice, getInvoiceById } =
  await import('../../lib/repositories/invoicesRepository.js')

const A = 't-test-numbering-a'
const B = 't-test-numbering-b'
const ctxA = { tenantId: A, userId: 'usr-test', role: 'super_admin' }
const ctxB = { tenantId: B, userId: 'usr-test', role: 'super_admin' }

before(async () => {
  for (const [id, slug, name] of [[A, 'test-numbering-a', 'Numbering A'], [B, 'test-numbering-b', 'Numbering B']]) {
    await pool.query(
      `INSERT INTO tenants (id, slug, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [id, slug, name])
    await pool.query(
      `INSERT INTO locations (id, tenant_id, name, code) VALUES ($1, $2, 'Test', 'TEST')
       ON CONFLICT (id) DO NOTHING`,
      [`loc-${id}`, id])
  }
})

after(async () => {
  for (const id of [A, B]) {
    await pool.query('DELETE FROM invoices WHERE tenant_id = $1', [id])
    await pool.query('DELETE FROM invoice_counters WHERE tenant_id = $1', [id])
    await pool.query('DELETE FROM locations WHERE tenant_id = $1', [id])
    await pool.query('DELETE FROM tenants WHERE id = $1', [id])
  }
  await pool.end()
})

test('a brand new café starts at 1', async () => {
  assert.equal(await nextInvoiceNumber(ctxA), 1)
  assert.equal(await nextInvoiceNumber(ctxA), 2)
  assert.equal(await nextInvoiceNumber(ctxA), 3)
})

test('a second café trading alongside it starts at 1 too, and neither skips', async () => {
  // Interleaved deliberately: this is the sequence of events that produced the
  // bug — a sale in one café, then a sale in the other, then back again.
  assert.equal(await nextInvoiceNumber(ctxB), 1)
  assert.equal(await nextInvoiceNumber(ctxA), 4)
  assert.equal(await nextInvoiceNumber(ctxB), 2)
  assert.equal(await nextInvoiceNumber(ctxA), 5)
  assert.equal(await nextInvoiceNumber(ctxB), 3)
})

test('a reserved block is contiguous and comes off that café\'s own counter', async () => {
  assert.deepEqual(await reserveInvoiceNumbers(ctxB, 4), [4, 5, 6, 7])
  assert.equal(await nextInvoiceNumber(ctxB), 8, 'the block is spent whether used or not')
  assert.equal(await nextInvoiceNumber(ctxA), 6, 'and the other café is untouched by it')
})

test('two cafés can each hold an invoice of the same number', async () => {
  const invoice = (tenantId) => ({
    id: 'inv-1',
    businessType: 'cafe',
    lines: [],
    subtotal: 10,
    total: 10,
    locationId: `loc-${tenantId}`,
    createdAt: new Date().toISOString(),
  })

  await saveInvoice(ctxA, invoice(A))
  await saveInvoice(ctxB, { ...invoice(B), total: 20, subtotal: 20 })

  const a = await getInvoiceById(ctxA, 'inv-1')
  const b = await getInvoiceById(ctxB, 'inv-1')
  assert.equal(a.total, 10, 'each café reads its own inv-1')
  assert.equal(b.total, 20)
})

test('saving over an id does not reach the other café\'s invoice of that number', async () => {
  await saveInvoice(ctxA, {
    id: 'inv-1', businessType: 'cafe', lines: [], subtotal: 11, total: 11,
    locationId: `loc-${A}`, createdAt: new Date().toISOString(),
  })
  assert.equal((await getInvoiceById(ctxA, 'inv-1')).total, 11, 'its own row is updated')
  assert.equal((await getInvoiceById(ctxB, 'inv-1')).total, 20, 'the other café\'s is not')
})
