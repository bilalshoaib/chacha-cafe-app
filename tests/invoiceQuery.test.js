import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInvoiceWhere } from '../lib/invoiceQuery.js'

test('no filters means no WHERE clause and no values', () => {
  assert.deepEqual(buildInvoiceWhere(), { whereSql: '', values: [] })
  assert.deepEqual(buildInvoiceWhere({}), { whereSql: '', values: [] })
})

test('placeholders stay in step with the values array', () => {
  const { whereSql, values } = buildInvoiceWhere({
    from: '2026-07-01T00:00:00.000Z',
    to: '2026-07-31T23:59:59.999Z',
    businessType: 'cafe',
    search: 'zinger',
  })
  assert.deepEqual(values, ['2026-07-01T00:00:00.000Z', '2026-07-31T23:59:59.999Z', 'cafe', 'zinger'])
  assert.match(whereSql, /created_at >= \$1/)
  assert.match(whereSql, /created_at <= \$2/)
  assert.match(whereSql, /business_type = \$3/)
  assert.match(whereSql, /\$4/)
})

test('a filter left out does not leave a gap in the numbering', () => {
  // `to` and `businessType` absent: search must be $2, not $4.
  const { whereSql, values } = buildInvoiceWhere({ from: 'A', search: 'b' })
  assert.deepEqual(values, ['A', 'b'])
  assert.match(whereSql, /created_at >= \$1/)
  assert.match(whereSql, /position\(\$2 IN lower\(id\)\)/)
  assert.doesNotMatch(whereSql, /\$3/)
})

test('every placeholder used has a value behind it', () => {
  for (const filters of [
    { from: 'A' }, { to: 'B' }, { businessType: 'cafe' }, { search: 'x' },
    { from: 'A', businessType: 'burger' }, { to: 'B', search: 'x' },
    { from: 'A', to: 'B', businessType: 'cafe', search: 'x' },
  ]) {
    const { whereSql, values } = buildInvoiceWhere(filters)
    const used = [...whereSql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]))
    assert.equal(Math.max(...used, 0), values.length, `highest placeholder should be ${values.length} for ${JSON.stringify(filters)}`)
    assert.ok(used.every((n) => n >= 1 && n <= values.length), 'no placeholder points past the values array')
  }
})

test('a business filter also admits combined invoices', () => {
  // An invoice holding items from both counters must appear under either
  // filter, which is what the report and list filters have always done.
  const { whereSql } = buildInvoiceWhere({ businessType: 'burger' })
  assert.match(whereSql, /business_type = \$1 OR business_type = 'combined'/)
})

test('search covers both the id and the shift number', () => {
  const { whereSql } = buildInvoiceWhere({ search: '42' })
  assert.match(whereSql, /position\(\$1 IN lower\(id\)\) > 0/)
  assert.match(whereSql, /shift_number::text = \$1/)
})

test('search goes through a placeholder, never string interpolation', () => {
  // The tell is that the SQL text does not vary with the needle: whatever the
  // cashier types travels in the values array, so a quote cannot reach the
  // query and a % or _ cannot become a wildcard.
  const needles = ['zinger', '50%', '_', "'; DROP TABLE invoices; --"]
  const shapes = new Set()
  for (const needle of needles) {
    const { whereSql, values } = buildInvoiceWhere({ search: needle })
    shapes.add(whereSql)
    assert.deepEqual(values, [needle])
  }
  assert.equal(shapes.size, 1, 'the SQL text must be the same for every needle')
  assert.ok(![...shapes][0].includes('LIKE'), 'position() is used, not LIKE')
})

test('filters are combined with AND', () => {
  const { whereSql } = buildInvoiceWhere({ from: 'A', to: 'B' })
  assert.match(whereSql, /^WHERE .+ AND .+$/)
})

test('the tenant predicate comes first and shifts the rest along', () => {
  const { whereSql, values } = buildInvoiceWhere({ tenantId: 't-chacha', from: 'A', search: 'b' })
  assert.deepEqual(values, ['t-chacha', 'A', 'b'])
  assert.match(whereSql, /tenant_id = \$1/)
  assert.match(whereSql, /created_at >= \$2/)
  assert.match(whereSql, /position\(\$3 IN lower\(id\)\)/)
})

test('without a tenant no tenant predicate is emitted', () => {
  // The repository always supplies one; this pins down that the builder does
  // not quietly invent a filter of its own when it is missing.
  const { whereSql } = buildInvoiceWhere({ from: 'A' })
  assert.doesNotMatch(whereSql, /tenant_id/)
})

test('one search term is matched against the id, the order number and the table', () => {
  // All three off the same placeholder — a second value would put the count
  // and the page one apart on their numbering.
  const { whereSql, values } = buildInvoiceWhere({ tenantId: 't1', search: '4a' })
  assert.deepEqual(values, ['t1', '4a'])
  assert.match(whereSql, /position\(\$2 IN lower\(id\)\)/)
  assert.match(whereSql, /shift_number::text = \$2/)
  assert.match(whereSql, /lower\(table_number\) = \$2/)
  assert.doesNotMatch(whereSql, /\$3/)
})

test('the table is matched whole, not as a substring', () => {
  // Searching "4" must not drag in tables 14, 24 and 41.
  const { whereSql } = buildInvoiceWhere({ search: '4' })
  assert.doesNotMatch(whereSql, /position\(\$1 IN lower\(table_number\)\)/)
})
