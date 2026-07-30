import { formatMoney } from './formatting.js'

/**
 * Matches a deal against one lowercase search term. A term can hit the deal's
 * name, its price ("1000" or "1,000"), or the name of any item inside it — so
 * staff can find a bundle by whatever they happen to remember about it.
 *
 * `labelFor(itemId)` resolves an included item id to its display name; callers
 * hold the menu in different shapes, so they supply the lookup.
 */
function matchesTerm(deal, needle, labelFor) {
  if (deal?.name?.toLowerCase().includes(needle)) return true

  const digits = needle.replace(/[^0-9.]/g, '')
  if (digits && String(deal?.price).includes(digits)) return true
  if (formatMoney(deal?.price ?? 0).toLowerCase().includes(needle)) return true

  return (deal?.includes || []).some((inc) =>
    String(labelFor(inc.itemId) ?? inc.itemId ?? '').toLowerCase().includes(needle),
  )
}

/** Every whitespace-separated term must match, so "zinger 1000" narrows. */
export function dealMatchesQuery(deal, query, labelFor) {
  const needle = String(query ?? '').trim().toLowerCase()
  if (!needle) return true
  return needle.split(/\s+/).every((term) => matchesTerm(deal, term, labelFor))
}
