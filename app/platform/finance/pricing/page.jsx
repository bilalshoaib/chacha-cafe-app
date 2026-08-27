'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import { usePlatformBooks } from '@/context/PlatformBooksContext.jsx'
import { useToast } from '@/context/ToastContext.jsx'
import { formatMoney } from '@/utils/formatting.js'

/**
 * The price list.
 *
 * A price per plan, and the cafés that pay something else. Trial is here and
 * priced at zero by default rather than hidden, because a trial that costs
 * something is a decision somebody may want to make, and a price list with a
 * plan missing from it invites the question of what that plan costs.
 */
export default function PlatformPricingPage() {
  const { report, refresh } = usePlatformBooks()
  const toast = useToast()
  const [drafts, setDrafts] = useState({})
  const [saving, setSaving] = useState(null)

  const prices = report?.planPrices ?? {}

  useEffect(() => {
    setDrafts(Object.fromEntries(Object.entries(prices).map(([p, v]) => [p, String(v)])))
    // Reseeded whenever the server's answer changes, which is what discards a
    // half-typed price cleanly after a save elsewhere.
  }, [report?.planPrices]) // eslint-disable-line react-hooks/exhaustive-deps

  async function savePlan(plan) {
    setSaving(plan)
    try {
      await api.setPlanPrice(plan, Number(drafts[plan]))
      toast.success(`${plan} is now ${formatMoney(Number(drafts[plan]))} a month.`)
      await refresh()
    } catch (e) {
      toast.error(e.message || 'Could not save that price.')
    } finally {
      setSaving(null)
    }
  }

  const overrides = (report?.perCafe ?? []).filter(
    (c) => c.monthlyPrice !== (prices[c.plan] ?? 0),
  )

  return (
    <div className="tenant-tab-stack">
      <div className="pf-card">
        <h2>Plan prices</h2>
        <p>What a café on each plan is billed a month. Changing one changes every café on it that has no price of its own.</p>
        <ul className="books-price-list">
          {Object.keys(prices).sort().map((plan) => (
            <li key={plan}>
              <span className="books-price-plan">{plan}</span>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                value={drafts[plan] ?? ''}
                disabled={saving === plan}
                onChange={(e) => setDrafts((d) => ({ ...d, [plan]: e.target.value }))}
              />
              <button
                type="button"
                className="ghost sm"
                disabled={saving === plan || drafts[plan] === String(prices[plan])}
                onClick={() => void savePlan(plan)}
              >
                {saving === plan ? 'Saving…' : 'Save'}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="pf-card">
        <h2>Cafés on their own price</h2>
        <p>
          Set on a café’s own Billing tab. Anything here overrides its plan, so a price change
          above passes it by.
        </p>
        {overrides.length === 0 ? (
          <p className="pf-hint">None — every café pays its plan’s price.</p>
        ) : (
          <ul className="books-price-list">
            {overrides.map((c) => (
              <li key={c.tenantId}>
                <Link href={`/platform/tenants/${c.tenantId}/billing`} className="books-price-plan cafe-name">{c.name}</Link>
                <span className="books-price-amount">{formatMoney(c.monthlyPrice)}/mo</span>
                <span className="pf-hint">plan says {formatMoney(prices[c.plan] ?? 0)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
