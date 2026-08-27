'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useTenantConsole } from '@/context/TenantConsoleContext.jsx'

/**
 * What this café is billed on, and what it pays.
 *
 * Money only. Whether they can *use* the product is next door on Access —
 * including the trial clock, which reads like a billing matter and is really a
 * lock-out one.
 */
export default function TenantBillingPage() {
  const { tenant, patch, saving } = useTenantConsole()
  // '' means "no price of its own", which is not the same as a price of zero
  // — the first falls back to the plan, the second is free.
  const [price, setPrice] = useState(tenant.monthlyPrice == null ? '' : String(tenant.monthlyPrice))

  return (
    <div className="tenant-tab-stack">
      <div className="pf-card">
        <h2>Plan</h2>
        <p>What they are billed on. Changing it takes effect immediately.</p>
        <div className="plan-picker" role="group" aria-label="Plan">
          {['trial', 'standard', 'multi-branch'].map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={p === tenant.plan}
              disabled={saving || p === tenant.plan}
              onClick={() => void patch({ plan: p }, `Plan changed to ${p}.`)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="pf-card">
        <h2>What they pay</h2>
        <p>
          Left empty they pay their plan’s price, set once on the{' '}
          <Link href="/platform/finance/pricing">price list</Link>. Fill it in only for a café that
          negotiated something else — a price here means a change to the plan passes them by.
        </p>
        <div className="pf-actions pf-actions-inline">
          <label className="pf-field pf-field-inline">
            <span>Their own price, a month</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={price}
              disabled={saving}
              placeholder="plan price"
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="primary"
            disabled={saving || price === (tenant.monthlyPrice == null ? '' : String(tenant.monthlyPrice))}
            onClick={() => void patch(
              { monthlyPrice: price === '' ? null : Number(price) },
              price === '' ? 'They pay their plan’s price again.' : 'Their own price saved.',
            )}
          >
            Save price
          </button>
        </div>
      </div>
    </div>
  )
}
