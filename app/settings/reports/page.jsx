'use client'
import RequireSuperAdmin from '@/components/RequireSuperAdmin.jsx'
import ReportsWorkbench from '@/components/ReportsWorkbench.jsx'
import { useBranding } from '@/context/BrandingContext.jsx'

/**
 * A café owner's own reports.
 *
 * The screen itself moved to components/ReportsWorkbench.jsx so that the
 * platform console can open the same one for a café it supports. Nothing about
 * what this page shows changed: with no tenantId the workbench scopes every
 * request to the session, exactly as this file did.
 *
 * The trading day rides in on the branding the server resolved for this
 * request, which is why "Today" here means this café's own day rather than the
 * 6 PM–5 PM that used to be written into the workbench.
 */
export default function ReportsPage() {
  const branding = useBranding()
  return (
    <RequireSuperAdmin>
      <ReportsWorkbench
        tenantName={branding?.name}
        dayStartHour={branding?.dayStartHour}
        dayEndHour={branding?.dayEndHour}
      />
    </RequireSuperAdmin>
  )
}
