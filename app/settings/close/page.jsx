'use client'
import RequireSuperAdmin from '@/components/RequireSuperAdmin.jsx'
import SettingsSubpage from '@/components/SettingsSubpage.jsx'
import ShiftClose from '@/components/ShiftClose.jsx'

/**
 * End of day.
 *
 * Owner-only, and that is the substance of the feature rather than a detail of
 * it: counting the drawer is the check on whoever worked the till, so a
 * cashier signing off their own variance is not a control at all. The guard
 * here keeps the screen out of sight; the route handler is what refuses.
 */
export default function ShiftClosePage() {
  return (
    <RequireSuperAdmin>
      <SettingsSubpage
        title="End of day"
        blurb="Count the drawer and close the trading day. The till's own figure and the counted one are recorded separately, and the difference between them is kept — it is how a café notices money going astray. Once a day is closed its figures are fixed, even if an invoice from it is later edited."
      >
        <ShiftClose />
      </SettingsSubpage>
    </RequireSuperAdmin>
  )
}
