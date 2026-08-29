'use client'
import RequireSuperAdmin from '@/components/RequireSuperAdmin.jsx'
import SettingsSubpage from '@/components/SettingsSubpage.jsx'
import TaxSettings from '@/components/TaxSettings.jsx'

/**
 * Sales tax.
 *
 * Owner-only for the same reason the API is: a cashier who can change the rate
 * can undercharge every sale for the rest of the shift, and the café is liable
 * for the difference. The guard here only keeps the screen out of sight — the
 * route handlers are what actually refuse.
 */
export default function TaxSettingsPage() {
  return (
    <RequireSuperAdmin>
      <SettingsSubpage
        title="Sales tax"
        blurb="What this café charges on top of — or inside — its menu prices. Tax is broken out on every receipt and totalled separately in reports, and each sale records the rate it was charged, so changing a rate never moves an invoice already issued."
      >
        <TaxSettings />
      </SettingsSubpage>
    </RequireSuperAdmin>
  )
}
