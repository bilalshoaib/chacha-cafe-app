import { CATEGORIES } from '../constants/categories.js'

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
 * border, and a second café may not price in rupees at all. The defaults keep
 * every existing call site rendering exactly as it does today, so the money
 * on screen does not change the day this ships — only where the choice lives
 * does.
 */
export function formatMoney(n, { locale = 'en-PK', currency = 'PKR' } = {}) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n)
}

export function formatShortDateTime(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' })
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const day = d.getDate()
  const year = d.getFullYear()
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${weekday} ${month} ${day}, ${year}  ${time}`
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
