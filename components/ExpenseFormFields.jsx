'use client'
import { BUSINESS_TYPES } from '@/constants/businessTypes.js'
import { EXPENSE_CATEGORIES } from '@/utils/expenses.js'

export default function ExpenseFormFields({
  title,
  setTitle,
  amount,
  setAmount,
  category,
  setCategory,
  businessType,
  setBusinessType,
  spentDate,
  setSpentDate,
  note,
  setNote,
  saving,
}) {
  return (
    <>
      <div className="expenses-form-grid">
        <label className="field">
          <span>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="e.g. Gas refill, Napkins"
            disabled={saving}
          />
        </label>
        <label className="field">
          <span>Amount (PKR)</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            inputMode="decimal"
            placeholder="0"
            disabled={saving}
          />
        </label>
        <label className="field">
          <span>Category</span>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} disabled={saving}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Business</span>
          <select
            className="select"
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            disabled={saving}
          >
            {BUSINESS_TYPES.map((bt) => (
              <option key={bt.id} value={bt.id}>
                {bt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Date spent</span>
          <input type="date" value={spentDate} onChange={(e) => setSpentDate(e.target.value)} disabled={saving} />
        </label>
      </div>
      <label className="field expenses-note-field">
        <span>Note (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Vendor, invoice #, etc."
          disabled={saving}
        />
      </label>
    </>
  )
}
