'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/api.js'
import ExpenseFormFields from '@/components/ExpenseFormFields.jsx'
import { expenseBusinessType } from '@/constants/businessTypes.js'
import { expenseDateInputValue } from '@/utils/expenses.js'
import { useToast } from '@/context/ToastContext.jsx'

export default function ExpenseEditPage() {
  const { expenseId } = useParams()
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('other')
  const [businessType, setBusinessType] = useState('cafe')
  const [spentDate, setSpentDate] = useState(() => expenseDateInputValue(new Date()))
  const [note, setNote] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoadError(''); setLoading(true)
      try {
        const r = await api.getExpense(expenseId)
        if (cancelled) return
        setTitle(r.title ?? ''); setAmount(String(r.amount ?? ''))
        setCategory(r.category || 'other'); setBusinessType(expenseBusinessType(r))
        setSpentDate(expenseDateInputValue(r.spentAt || r.createdAt)); setNote(r.note ?? '')
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'Could not load expense')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [expenseId])

  async function handleSubmit(e) {
    e.preventDefault(); setSaveError('')
    const spentAt = new Date(spentDate)
    if (Number.isNaN(spentAt.getTime())) { setSaveError('Pick a valid date.'); return }
    setSaving(true)
    try {
      await api.updateExpense(expenseId, { title: title.trim(), amount: Number(amount), category, businessType, note: note.trim(), spentAt: spentAt.toISOString() })
      toast.success('Expense updated')
      router.replace(`/expenses/${expenseId}`)
    } catch (err) {
      setSaveError(err.message || 'Could not save')
      toast.error(err.message || 'Could not save expense')
    } finally { setSaving(false) }
  }

  return (
    <main className="expenses-page team-form-page">
      <div className="expenses-head">
        <div>
          <p className="muted small team-detail-kicker">Edit expense</p>
          <h2>{loading ? '…' : title || 'Expense'}</h2>
        </div>
        <Link href={loadError ? '/expenses' : `/expenses/${expenseId}`} className="ghost sm">Cancel</Link>
      </div>

      {loadError ? <section className="card"><p className="banner error" role="alert">{loadError}</p></section> : null}

      {!loadError && !loading ? (
        <section className="card expenses-form-card">
          <form className="expenses-form" onSubmit={(e) => void handleSubmit(e)}>
            <ExpenseFormFields
              title={title} setTitle={setTitle}
              amount={amount} setAmount={setAmount}
              category={category} setCategory={setCategory}
              businessType={businessType} setBusinessType={setBusinessType}
              spentDate={spentDate} setSpentDate={setSpentDate}
              note={note} setNote={setNote}
              saving={saving}
            />
            {saveError ? <p className="banner error" role="alert">{saveError}</p> : null}
            <div className="expenses-form-actions row">
              <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </section>
      ) : null}

      {loading ? <p className="muted">Loading…</p> : null}
    </main>
  )
}
