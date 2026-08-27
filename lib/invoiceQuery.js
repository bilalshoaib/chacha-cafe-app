/**
 * Builds the WHERE clause shared by the invoice count and the invoice page.
 *
 * Kept separate from the repository, and free of any database import, so the
 * placeholder numbering can be tested directly. An off-by-one in $1/$2/$3 is
 * the easiest mistake to make here and the hardest to notice: the query still
 * runs, it just filters by the wrong value.
 *
 * The count and the page must be filtered by identical predicates — if they
 * could drift, the pager would disagree with the rows it is paging over — so
 * both call this rather than assembling their own.
 *
 *   tenantId       the café whose invoices these are
 *   from, to       ISO timestamps bounding created_at
 *   businessType   also matches 'combined', because an invoice holding items
 *                  from both businesses belongs in either list
 *   search         a substring of the id, or an exact shift number
 *
 * Returns { whereSql, values }, where whereSql is '' when nothing is filtered.
 */
export function buildInvoiceWhere({ tenantId, from, to, businessType, search } = {}) {
  const where = []
  const values = []

  // Always first, and never optional in practice: the repository passes the
  // tenant from the session on every call. Row level security enforces the
  // same thing underneath, so this is the belt to that pair of braces — if
  // either one is missing the other still holds.
  if (tenantId) {
    values.push(tenantId)
    where.push(`tenant_id = $${values.length}`)
  }

  if (from) {
    values.push(from)
    where.push(`created_at >= $${values.length}`)
  }
  if (to) {
    values.push(to)
    where.push(`created_at <= $${values.length}`)
  }
  if (businessType) {
    values.push(businessType)
    where.push(`(business_type = $${values.length} OR business_type = 'combined')`)
  }
  if (search) {
    values.push(search)
    // position() rather than LIKE: the needle is user input, and LIKE would
    // read a % or _ inside it as a wildcard.
    where.push(`(position($${values.length} IN lower(id)) > 0 OR shift_number::text = $${values.length})`)
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', values }
}
