export const BUSINESS_TYPES = [
  {
    id: 'cafe',
    label: 'Chacha Cafe',
    shortLabel: 'Cafe',
    description: 'Pizzas, shawarmas, rolls, drinks & cafe menu',
  },
  {
    id: 'burger',
    label: 'Chacha Burger',
    shortLabel: 'Burger',
    description: 'Burgers, fries, wings & burger-side menu',
  },
]

export const MENU_ITEM_BUSINESS_OPTIONS = [
  ...BUSINESS_TYPES,
  { id: 'both', label: 'Both (Cafe & Burger)', shortLabel: 'Both' },
]

export const DEAL_BUSINESS_TYPE_OPTIONS = [
  ...BUSINESS_TYPES,
  { id: 'combined', label: 'Combined (Cafe + Burger)', shortLabel: 'Combined' },
]

export function normalizeBusinessType(input) {
  const s = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
  if (s === 'burger' || s === 'chacha-burger' || s === 'chacha_burger') return 'burger'
  if (s === 'cafe' || s === 'chacha-cafe' || s === 'chacha_cafe') return 'cafe'
  if (s === 'combined') return 'combined'
  return null
}

export function isSharedMenuItem(item) {
  return String(item?.businessType ?? '').trim().toLowerCase() === 'both'
}

export function businessTypeLabel(type) {
  if (type === 'both') return 'Cafe & Burger'
  if (type === 'combined') return 'Combined (Cafe + Burger)'
  const t = normalizeBusinessType(type)
  if (t === 'burger') return 'Chacha Burger'
  if (t === 'cafe') return 'Chacha Cafe'
  return type || '—'
}

export function businessTypeShortLabel(type) {
  if (type === 'both') return 'Both'
  if (type === 'combined') return 'Combined'
  const t = normalizeBusinessType(type)
  if (t === 'burger') return 'Burger'
  if (t === 'cafe') return 'Cafe'
  return '—'
}

export function itemBusinessType(item) {
  if (isSharedMenuItem(item)) return 'both'
  const explicit = normalizeBusinessType(item?.businessType)
  if (explicit) return explicit
  const cat = String(item?.category ?? '').toLowerCase()
  if (cat === 'burger' || cat === 'burgers') return 'burger'
  return 'cafe'
}

export function itemMatchesBusiness(item, orderType) {
  const type = normalizeBusinessType(orderType)
  if (!type) return false
  if (isSharedMenuItem(item)) return true
  return itemBusinessType(item) === type
}

export function dealBusinessType(deal, menuItems) {
  if (deal?.businessType === 'combined') return 'combined'
  const explicit = normalizeBusinessType(deal?.businessType)
  if (explicit) return explicit
  const itemMap = new Map((menuItems || []).map((i) => [i.id, i]))
  const types = new Set()
  for (const inc of deal?.includes || []) {
    const item = itemMap.get(inc.itemId)
    if (item) types.add(itemBusinessType(item))
  }
  if (types.size === 1) return [...types][0]
  return 'cafe'
}

export function orderBusinessType(order) {
  return normalizeBusinessType(order?.businessType) || 'cafe'
}

export function invoiceBusinessType(invoice) {
  return normalizeBusinessType(invoice?.businessType) || 'cafe'
}

export function expenseBusinessType(expense) {
  return normalizeBusinessType(expense?.businessType) || 'cafe'
}
