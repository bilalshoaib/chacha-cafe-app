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

export const EXPENSE_RANGE_PRESETS = [
  {
    id: 'all',
    label: 'All time',
    range: () => ({ from: '', to: '' }),
  },
  {
    id: '30d',
    label: 'Last 30 days',
    range: () => {
      const end = new Date()
      const start = new Date(end)
      start.setDate(start.getDate() - 29)
      return { from: toISOStart(start), to: toISOEnd(end) }
    },
  },
  {
    id: 'this_month',
    label: 'This month',
    range: () => {
      const n = new Date()
      return { from: toISOStart(startOfMonth(n)), to: toISOEnd(n) }
    },
  },
  {
    id: 'last_month',
    label: 'Last month',
    range: () => {
      const n = new Date()
      const first = startOfMonth(new Date(n.getFullYear(), n.getMonth() - 1, 1))
      const last = endOfMonth(first)
      return { from: toISOStart(first), to: toISOEnd(last) }
    },
  },
]
