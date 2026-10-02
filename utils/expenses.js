export const EXPENSE_CATEGORIES = [
  { value: 'supplies', label: 'Supplies' },
  { value: 'rent', label: 'Rent' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'wages', label: 'Wages' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'food_cost', label: 'Food cost' },
  { value: 'other', label: 'Other' },
]

export function expenseCategoryLabel(value) {
  const c = EXPENSE_CATEGORIES.find((x) => x.value === value)
  return c ? c.label : value
}

export function toISOStart(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.toISOString()
}

export function toISOEnd(d) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x.toISOString()
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

export function expenseDateInputValue(d) {
  const x = new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
