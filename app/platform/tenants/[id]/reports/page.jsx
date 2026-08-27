'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import ReportsWorkbench from '@/components/ReportsWorkbench.jsx'
import { api } from '@/api.js'

/**
 * One café's reports, read from the platform console.
 *
 * The same screen their owner sees, against the same endpoints — the console
 * has no report queries of its own, so there is no way for the figures quoted
 * on a support call to differ from the ones the customer is looking at.
 *
 * Read-only by construction rather than by omission: the context the server
 * builds for these requests uses a database role with no write privileges at
 * all, so nothing reachable from here can alter the café's books.
 *
 * The café's name is fetched for the heading and the printed PDF, and the page
 * renders before it arrives — the reports do not depend on it, and blocking
 * the whole screen on one small request would be a second wait for nothing.
 */
export default function TenantReportsPage() {
  const { id } = useParams()
  const [tenant, setTenant] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const t = await api.getTenant(id)
        if (!cancelled) setTenant(t)
      } catch {
        // The workbench surfaces any real access problem through its own error
        // banner; a missing name is not worth a second one.
      }
    })()
    return () => { cancelled = true }
  }, [id])

  return (
    <ReportsWorkbench
      tenantId={id}
      tenantName={tenant?.name ?? null}
      // The café's hours, not the platform owner's. Undefined until the café
      // arrives, which is what makes the workbench fall back to the default
      // for the first render rather than to somebody else's day.
      dayStartHour={tenant?.dayStartHour}
      dayEndHour={tenant?.dayEndHour}
      title={tenant ? `${tenant.name} — reports` : 'Reports'}
      subtitle={<>Their sales and expenses, exactly as their owner sees them. Read-only, and written to this café’s trail.</>}
      backHref={`/platform/tenants/${id}`}
      backLabel="← Back to café"
    />
  )
}
