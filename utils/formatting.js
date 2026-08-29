import { CATEGORIES } from '../constants/categories.js'
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from '../constants/locales.js'

/**
 * How a category is written on screen.
 *
 * `categories` is the café's own list, from the categories table. The
 * constants list remains only as the seed for a brand-new tenant and as the
 * fallback for a caller that has not loaded the list yet; an unrecognised key
 * is title-cased, which is what a freshly typed category renders as until the
 * owner gives it a label.
 */
export function categoryLabel(key, categories) {
  const list = categories?.length ? categories : CATEGORIES
  const c = list.find((x) => x.key === key)
  if (c) return c.label
  if (!key) return key
  return key
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** The café's icon for a category, or a neutral plate. */
export function categoryIcon(key, categories) {
  return (categories ?? []).find((c) => c.key === key)?.icon || '🍽️'
}

/** The café's colour for a category, or the neutral one. */
export function categoryColor(key, categories) {
  return (categories ?? []).find((c) => c.key === key)?.color || '#55483c'
}

/**
 * The café's own currency and number formatting.
 *
 * Both come from the location, not from here: a customer can open across a
 * border, and a second café may not price in rupees at all. The defaults are
 * Pakistan's, which is what every row held before this was settable — so a
 * caller that has not been given the café's choice yet renders exactly what it
 * rendered before, rather than silently switching a price to dollars.
 *
 * Most callers should not use this directly. `useMoney()` in
 * context/BrandingContext.jsx hands a component a formatter already bound to
 * the café it is showing, which is one fewer thing for each of forty call
 * sites to remember to pass.
 */
export function formatMoney(n, { locale = DEFAULT_LOCALE, currency = DEFAULT_CURRENCY } = {}) {
  return moneyFormatter({ locale, currency })(n)
}

/**
 * A formatter bound to one currency and language.
 *
 * Cached on the pair because constructing an Intl.NumberFormat is expensive
 * relative to using one, and the menu board formats every price on the wall on
 * every render. The cache is keyed by the two strings and holds at most as many
 * entries as there are combinations in constants/locales.js, so it needs no
 * eviction.
 */
const moneyFormatters = new Map()

export function moneyFormatter({ locale = DEFAULT_LOCALE, currency = DEFAULT_CURRENCY } = {}) {
  const key = `${locale}|${currency}`
  const hit = moneyFormatters.get(key)
  if (hit) return hit

  let fmt
  try {
    fmt = new Intl.NumberFormat(locale, { style: 'currency', currency })
  } catch {
    // An unknown tag or code reaching this far is a bug upstream, but a till
    // that throws instead of printing a price is a worse one. constants/locales
    // validates on the way in; this is the net under it.
    fmt = new Intl.NumberFormat(DEFAULT_LOCALE, { style: 'currency', currency: DEFAULT_CURRENCY })
  }

  const format = (n) => fmt.format(Number(n) || 0)
  moneyFormatters.set(key, format)
  return format
}

/**
 * A date and time as this café writes them.
 *
 * The locale defaults to US English rather than to DEFAULT_LOCALE: that is what
 * this has always produced, and the day this became settable is not the day
 * every existing café's timestamps should change shape. Pass the café's own tag
 * to get its own format.
 *
 * Built from parts rather than a single toLocaleString because the two-space
 * gap between the date and the time is what the invoice list aligns on.
 */
export function formatShortDateTime(value, { locale = 'en-US', timeZone } = {}) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const opts = timeZone ? { timeZone } : {}
  const date = d.toLocaleDateString(locale, {
    ...opts,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString(locale, { ...opts, hour: 'numeric', minute: '2-digit' })
  return `${date}  ${time}`
}

export function formatItemExtras(obj) {
  if (!obj || typeof obj !== 'object') return ''
  const bits = []
  if (obj.size) bits.push(obj.size)
  if (obj.flavour) bits.push(obj.flavour)
  return bits.join(' · ')
}

/**
 * The category tabs, in the café's own order.
 *
 * Only categories that have items get a tab. The previous version seeded the
 * set from the hardcoded list, so this café showed empty tabs for Fries, Wings
 * and Rolls — none of which it sells — while its real categories sorted
 * alphabetically at the end.
 *
 * A category the owner has ordered comes first, in that order; anything typed
 * into an item and not yet given a place follows, alphabetically.
 */
export function buildCategoryTabs(menuItems, categories) {
  const list = categories?.length ? categories : CATEGORIES
  const used = new Set()
  for (const i of menuItems) {
    if (i.category) used.add(i.category)
  }
  const ordered = []
  for (const c of list) {
    if (used.has(c.key)) ordered.push(c.key)
  }
  for (const k of [...used].sort()) {
    if (!ordered.includes(k)) ordered.push(k)
  }
  return ordered.map((key) => ({ key, label: categoryLabel(key, categories) }))
}
