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

export function invoiceDateInputValue(d) {
  const x = new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseInvoiceDateInput(s) {
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export const INVOICE_RANGE_PRESETS = [
  {
    id: 'all',
    label: 'All data',
    range: () => ({ from: '', to: '' }),
  },
  {
    id: 'today',
    label: 'Today',
    range: () => {
      const n = new Date()
      return { from: toISOStart(n), to: toISOEnd(n) }
    },
  },
  {
    id: 'last_week',
    label: 'Last week',
    range: () => {
      const end = new Date()
      const start = new Date(end)
      start.setDate(start.getDate() - 6)
      return { from: toISOStart(start), to: toISOEnd(end) }
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

export const INVOICE_PAGE_SIZE = 20
