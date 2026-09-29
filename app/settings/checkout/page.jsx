'use client'
import RequireSuperAdmin from '@/components/RequireSuperAdmin.jsx'
import SettingsSubpage from '@/components/SettingsSubpage.jsx'
import NewOrderPaymentSettings from '@/components/NewOrderPaymentSettings.jsx'

/**
 * New orders: whether one is rung up already paid. Owner-only, as the API is.
 */
export default function CheckoutSettingsPage() {
  return (
    <RequireSuperAdmin>
      <SettingsSubpage
        title="New orders"
        blurb="Whether a sale comes out of checkout unpaid, to be settled later, or already marked paid — for a counter where customers pay as they order."
      >
        <NewOrderPaymentSettings />
      </SettingsSubpage>
    </RequireSuperAdmin>
  )
}
