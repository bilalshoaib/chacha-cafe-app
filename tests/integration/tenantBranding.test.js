/**
 * A café's identity, as the platform console sets it.
 *
 * Two things are being pinned down here.
 *
 * The first is that a colour is a colour. Whatever is stored ends up written
 * verbatim into a `:root{--brand-primary:…}` block by app/layout.jsx, on every
 * page that café serves. A value that is not six-digit hex is a way to close
 * that rule early and write CSS of one's choosing into a customer's app, so
 * the refusal is a security property and not a tidiness one.
 *
 * The second is that reading a café's reports from the console cannot write to
 * it. That guarantee comes from the database role the read-only context steps
 * into, not from any check in a route — which is exactly why it is worth a
 * test that goes all the way to Postgres.
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

const { pool, withTenant } = await import('../../lib/db.js')
const {
  createTenant, getTenant, updateTenant,
  setTenantLogo, getTenantLogo, clearTenantLogo,
} = await import('../../lib/repositories/tenantsRepository.js')

/** A 1×1 transparent PNG — the smallest thing that is genuinely an image. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const created = []

async function makeCafe(overrides = {}) {
  const unique = `${Date.now()}-${created.length}`
  const result = await createTenant({
    name: 'Branding Test Cafe',
    slug: `branding-test-${unique}`,
    ownerEmail: `owner-${unique}@branding-test-cafe.invalid`,
    starterMenu: 'cafe',
    ...overrides,
  })
  assert.ok(!result.error, result.error)
  created.push(result.tenant.id)
  return result
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

test('a café can be created already wearing its own colours', async () => {
  const { tenant } = await makeCafe({
    brandPrimary: '#123456',
    brandSecondary: '#ABCDEF',
    tagline: 'Beans and things',
    receiptFooter: 'See you soon',
  })
  assert.equal(tenant.brandPrimary, '#123456')
  assert.equal(tenant.brandSecondary, '#abcdef', 'normalised, so two spellings of one colour compare equal')
  assert.equal(tenant.tagline, 'Beans and things')
  assert.equal(tenant.receiptFooter, 'See you soon')
})

test('a café created without colours falls back rather than storing a default', async () => {
  const { tenant } = await makeCafe()
  assert.equal(tenant.brandPrimary, null)
  assert.equal(tenant.brandSecondary, null)
  // Null and not the product's hex: the fallback lives in one place, so
  // re-skinning the product moves every café that never chose.
})

test('anything that is not a six-digit hex colour is refused', async () => {
  const { tenant } = await makeCafe()
  const rejected = [
    'red',
    '#abc',
    '#12345678',
    'teal; } body { display: none } :root { --x: #fff',
    '#0d9488; --brand-secondary: url(https://example.invalid/x)',
  ]
  for (const value of rejected) {
    const result = await updateTenant(tenant.id, { brandPrimary: value })
    assert.match(result.error ?? '', /must be a colour/, `refused: ${value}`)
  }
  assert.equal((await getTenant(tenant.id)).brandPrimary, null, 'and nothing was written')
})

test('an empty colour clears it back to the product palette', async () => {
  const { tenant } = await makeCafe({ brandPrimary: '#123456', tagline: 'Something' })
  const cleared = await updateTenant(tenant.id, { brandPrimary: '', tagline: '' })
  assert.ok(!cleared.error, cleared.error)
  assert.equal(cleared.tenant.brandPrimary, null)
  assert.equal(cleared.tenant.tagline, null)
})

test('an edit touches only the fields it names', async () => {
  const { tenant } = await makeCafe({ brandPrimary: '#111111', brandSecondary: '#222222' })
  const renamed = await updateTenant(tenant.id, { name: 'Renamed Cafe' })
  assert.equal(renamed.tenant.name, 'Renamed Cafe')
  assert.equal(renamed.tenant.brandPrimary, '#111111', 'the colours were not named, so they stand')
  assert.equal(renamed.tenant.brandSecondary, '#222222')
})

test('a URL name already in use is refused, and the café keeps its own', async () => {
  const { tenant: first } = await makeCafe()
  const { tenant: second } = await makeCafe()

  const clash = await updateTenant(second.id, { slug: first.slug })
  assert.match(clash.error ?? '', /already taken/)
  assert.equal((await getTenant(second.id)).slug, second.slug)

  // Its own slug is not a clash with itself.
  const same = await updateTenant(second.id, { slug: second.slug })
  assert.ok(!same.error, same.error)
})

test('a logo round-trips, and its URL changes when it does', async () => {
  const { tenant } = await makeCafe()
  assert.equal(tenant.logoUrl, null)

  const stored = await setTenantLogo(tenant.id, { mime: 'image/png', data: PNG })
  assert.ok(!stored.error, stored.error)
  assert.match(stored.tenant.logoUrl, /^\/api\/branding\/.+\/logo\?v=\d+$/)

  const logo = await getTenantLogo(tenant.id)
  assert.equal(logo.mime, 'image/png')
  assert.equal(logo.bytes.toString('base64'), PNG, 'byte for byte')

  // Replacing it must move the URL, or a browser holding the old one — served
  // immutable for a year — would never see the new picture.
  await new Promise((r) => setTimeout(r, 10))
  const replaced = await setTenantLogo(tenant.id, { mime: 'image/webp', data: PNG })
  assert.notEqual(replaced.tenant.logoUrl, stored.tenant.logoUrl)

  const removed = await clearTenantLogo(tenant.id)
  assert.equal(removed.tenant.logoUrl, null)
  assert.equal(await getTenantLogo(tenant.id), null, 'the bytes go with the pointer')
})

test('a logo that is not an image, or is too large, is refused', async () => {
  const { tenant } = await makeCafe()
  const wrongType = await setTenantLogo(tenant.id, { mime: 'text/html', data: PNG })
  assert.match(wrongType.error ?? '', /PNG, JPEG, WebP or SVG/)

  const tooBig = await setTenantLogo(tenant.id, {
    mime: 'image/png', data: Buffer.alloc(600 * 1024).toString('base64'),
  })
  assert.match(tooBig.error ?? '', /under 512 KB/)

  assert.equal(await getTenantLogo(tenant.id), null, 'and neither was stored')
})

test('the context the console reads reports through can read but not write', async () => {
  const { tenant } = await makeCafe()
  // The shape requireReportReader() builds for the platform owner.
  const ctx = { tenantId: tenant.id, role: 'super_admin', readOnly: true }

  const read = await withTenant(ctx, (c) => c.query('SELECT COUNT(*)::int AS n FROM invoices'))
  assert.equal(read.rows[0].n, 0, 'it can read the café')

  await assert.rejects(
    () => withTenant(ctx, (c) => c.query(
      `INSERT INTO expenses (id, tenant_id, title, amount) VALUES ($1, $2, 'x', 1)`,
      [`exp-ro-${Date.now()}`, tenant.id])),
    'and the database itself refuses the write, with no route guard involved',
  )
})
