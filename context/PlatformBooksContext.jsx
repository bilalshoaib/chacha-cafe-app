'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '@/api.js'
import { useToast } from '@/context/ToastContext.jsx'

const PlatformBooksContext = createContext(null)

/** The last day of the month `d` falls in, as YYYY-MM-DD. */
function endOfMonth(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
}

/** Ranges worth having as one click, since almost every question is one of them. */
export function presetRange(key) {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const day = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd)).toISOString().slice(0, 10)
  switch (key) {
    case 'this-month':  return { from: day(y, m, 1), to: endOfMonth(now) }
    case 'last-month':  return { from: day(y, m - 1, 1), to: endOfMonth(new Date(Date.UTC(y, m, 0))) }
    case 'this-year':   return { from: day(y, 0, 1), to: day(y, 11, 31) }
    default:            return { from: '', to: '' }
  }
}

/**
 * The platform's books, held across the four tabs that read them.
 *
 * The range belongs here rather than on any one tab: picking "last month" on
 * the report and then opening Expenses should show last month's expenses, not
 * silently reset to everything. Recording anything refetches the report, so
 * the totals on the first tab are never behind the rows on the third.
 */
export function PlatformBooksProvider({ children }) {
  const toast = useToast()
  const [rangeKey, setRangeKey] = useState('this-month')
  const [range, setRange] = useState(() => presetRange('this-month'))
  const [report, setReport] = useState(null)
  const [payments, setPayments] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [r, p, e] = await Promise.all([
        api.platformFinance(range),
        api.platformPayments(range),
        api.platformExpenses(range),
      ])
      setReport(r); setPayments(p); setExpenses(e); setError('')
    } catch (err) {
      setError(err.message || 'Could not load the books.')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { void refresh() }, [refresh])

  const chooseRange = useCallback((key) => {
    setRangeKey(key)
    if (key !== 'custom') setRange(presetRange(key))
  }, [])

  const addPayment = useCallback(async (body) => {
    try {
      await api.recordPlatformPayment(body)
      toast.success('Payment recorded.')
      await refresh()
      return true
    } catch (e) { toast.error(e.message || 'Could not record that payment.'); return false }
  }, [refresh, toast])

  const addExpense = useCallback(async (body) => {
    try {
      await api.recordPlatformExpense(body)
      toast.success('Expense recorded.')
      await refresh()
      return true
    } catch (e) { toast.error(e.message || 'Could not record that expense.'); return false }
  }, [refresh, toast])

  const removePayment = useCallback(async (id) => {
    try {
      await api.deletePlatformPayment(id)
      toast.success('Payment removed.')
      await refresh()
    } catch (e) { toast.error(e.message || 'Could not remove that payment.') }
  }, [refresh, toast])

  const removeExpense = useCallback(async (id) => {
    try {
      await api.deletePlatformExpense(id)
      toast.success('Expense removed.')
      await refresh()
    } catch (e) { toast.error(e.message || 'Could not remove that expense.') }
  }, [refresh, toast])

  const value = useMemo(() => ({
    range, rangeKey, chooseRange, setRange, setRangeKey,
    report, payments, expenses, loading, error, refresh,
    addPayment, addExpense, removePayment, removeExpense,
  }), [range, rangeKey, chooseRange, report, payments, expenses, loading, error,
       refresh, addPayment, addExpense, removePayment, removeExpense])

  return <PlatformBooksContext.Provider value={value}>{children}</PlatformBooksContext.Provider>
}

export function usePlatformBooks() {
  const ctx = useContext(PlatformBooksContext)
  if (!ctx) throw new Error('usePlatformBooks must be used within PlatformBooksProvider')
  return ctx
}
