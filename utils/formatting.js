import { CATEGORIES } from '../constants/categories.js'

export function categoryLabel(key) {
  const c = CATEGORIES.find((x) => x.key === key)
  if (c) return c.label
  if (!key) return key
  return key
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
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

export function buildCategoryTabs(menuItems) {
  const keys = new Set(CATEGORIES.map((c) => c.key))
  for (const i of menuItems) {
    if (i.category) keys.add(i.category)
  }
  const ordered = []
  for (const c of CATEGORIES) {
    if (keys.has(c.key)) ordered.push(c.key)
  }
  for (const k of [...keys].sort()) {
    if (!ordered.includes(k)) ordered.push(k)
  }
  return ordered.map((key) => ({ key, label: categoryLabel(key) }))
}
