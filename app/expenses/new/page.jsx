'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/api.js'
import ExpenseFormFields from '@/components/ExpenseFormFields.jsx'
import { expenseDateInputValue } from '@/utils/expenses.js'
import { useToast } from '@/context/ToastContext.jsx'

export default function ExpenseAddPage() {
  const router = useRouter()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('other')
  const [businessType, setBusinessType] = useState('cafe')
  const [spentDate, setSpentDate] = useState(() => expenseDateInputValue(new Date()))
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const spentAt = new Date(spentDate)
    if (Number.isNaN(spentAt.getTime())) { setError('Pick a valid date.'); return }
    setSaving(true)
    try {
      const created = await api.createExpense({ title: title.trim(), amount: Number(amount), category, businessType, note: note.trim(), spentAt: spentAt.toISOString() })
      toast.success('Expense saved')
      router.replace(`/expenses/${created.id}`)
    } catch (err) {
      setError(err.message || 'Could not save')
      toast.error(err.message || 'Could not save expense')
    } finally { setSaving(false) }
  }

  return (
    <main className="expenses-page team-form-page">
      <div className="expenses-head">
        <div>
          <p className="muted small team-detail-kicker">Add expense</p>
          <h2>New expense</h2>
          <p className="muted small">Amounts are in PKR. Choose which business this expense belongs to.</p>
        </div>
        <Link href="/expenses" className="ghost sm">Cancel</Link>
      </div>
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
          {error ? <p className="banner error" role="alert">{error}</p> : null}
          <div className="expenses-form-actions row">
            <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save expense'}</button>
          </div>
        </form>
      </section>
    </main>
  )
}
