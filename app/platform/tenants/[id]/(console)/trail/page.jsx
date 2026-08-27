'use client'
import { useTenantConsole } from '@/context/TenantConsoleContext.jsx'
import { formatShortDateTime } from '@/utils/formatting.js'

/** Everything the platform has done to this café, and every look inside. */
export default function TenantTrailPage() {
  const { tenant } = useTenantConsole()
  const audit = tenant.audit ?? []

  return (
    <div className="pf-card">
      <h2>Trail</h2>
      <p>
        Everything the platform has done to this café, and every time it has looked inside. The
        café’s own owner can see this, which is what makes support access something they can trust
        rather than something they have to take on faith.
      </p>
      {audit.length === 0 ? (
        <p className="pf-hint">Nothing yet.</p>
      ) : (
        <ul className="audit-list">
          {audit.map((entry) => (
            <li key={entry.id}>
              <span className="audit-what">{entry.detail || entry.action}</span>
              <span className="audit-when">{formatShortDateTime(entry.createdAt)}</span>
              <span className="audit-who">{entry.actorEmail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
