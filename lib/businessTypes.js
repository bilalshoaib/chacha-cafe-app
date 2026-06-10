export const VALID_BUSINESS_TYPES = ['cafe', 'burger']
export const VALID_DEAL_BUSINESS_TYPES = ['cafe', 'burger', 'combined']

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

export function businessTypeLabel(type) {
  if (type === 'both') return 'Cafe & Burger'
  if (type === 'burger') return 'Chacha Burger'
  if (type === 'cafe') return 'Chacha Cafe'
  return type || '—'
}

function isSharedMenuItem(item) {
  return String(item?.businessType ?? '').trim().toLowerCase() === 'both'
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

export function parseMenuItemBusinessType(input, fallbackItem) {
  if (input === undefined || input === null || input === '') {
    return itemBusinessType(fallbackItem ?? { businessType: null })
  }
  const s = String(input).trim().toLowerCase()
  if (s === 'both') return 'both'
  const bt = normalizeBusinessType(input)
  if (!bt) return null
  return bt
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
