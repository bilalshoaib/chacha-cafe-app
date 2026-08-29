'use client'
import { PendingLink } from '@/components/NavPending.jsx'
import { useParams } from 'next/navigation'
import { useTenantConsole } from '@/context/TenantConsoleContext.jsx'
import { tenantAccess, trialDaysLeft } from '@/lib/tenantAccess.js'
import { formatShortDateTime, moneyFormatter } from '@/utils/formatting.js'
import { currencyInfo, localeForCurrency } from '@/constants/locales.js'

/**
 * What this café is and how it is doing — the tab you land on.
 *
 * Deliberately holds no controls. It is the screen you open before a phone
 * call, so everything on it answers "what is going on here", and every answer
 * links to the tab that can change it.
 */
export default function TenantOverviewPage() {
  const { id } = useParams()
  const { tenant } = useTenantConsole()
  const base = `/platform/tenants/${id}`

  const access = tenantAccess(tenant)
  const daysLeft = trialDaysLeft(tenant)

  const stats = [
    { label: 'Invoices', value: (tenant.invoiceCount ?? 0).toLocaleString(), note: 'all time' },
    { label: 'Last order', value: tenant.lastOrderAt ? formatShortDateTime(tenant.lastOrderAt) : 'never',
      note: tenant.lastOrderAt ? null : 'they have not started', warn: !tenant.lastOrderAt },
    { label: 'Staff', value: tenant.userCount, note: 'accounts' },
    { label: 'Branches', value: tenant.locationCount, note: `${tenant.brandCount} counter${tenant.brandCount === 1 ? '' : 's'}` },
  ]

  const recent = (tenant.audit ?? []).slice(0, 5)

  // This café's money, not the console's: formatted through the functions
  // directly rather than the useMoney() hook, which would answer in the
  // currency of whoever is signed in. The ROADMAP's rule for exactly this case.
  const currency = currencyInfo(tenant.currency)
  const sample = moneyFormatter({
    locale: localeForCurrency(tenant.currency),
    currency: currency.code,
  })(1234.56)

  return (
    <div className="tenant-overview">
      <section className="platform-stats">
        {stats.map((s) => (
          <article key={s.label} className={`platform-stat${s.warn ? ' platform-stat-warn' : ''}`}>
            <span className="platform-stat-label">{s.label}</span>
            <strong className="platform-stat-value">{s.value}</strong>
            {s.note ? <span className="platform-stat-note">{s.note}</span> : null}
          </article>
        ))}
      </section>

      <div className="platform-columns">
        <div className="platform-columns-left">
          <div className={`pf-card ${access.allowed ? '' : 'pf-card-suspended'}`}>
            <h2>Standing</h2>
            {access.allowed ? (
              <p>
                Working normally on the <strong>{tenant.plan}</strong> plan.
                {tenant.status === 'trial' && daysLeft != null ? (
                  <> Their trial has <strong>{daysLeft} {daysLeft === 1 ? 'day' : 'days'}</strong> left
                  {tenant.trialEndsAt ? <> — it ends {formatShortDateTime(tenant.trialEndsAt)}</> : null}.</>
                ) : null}
              </p>
            ) : (
              <p>{access.message}</p>
            )}
            <div className="pf-actions">
              {/* Straight to the control, not to a tab it is somewhere on.
                  When a café cannot work this is the link being looked for. */}
              <PendingLink href={`${base}/access`} className="ghost sm btn-link">
                {access.allowed ? 'Trial and access →' : 'Put it right →'}
              </PendingLink>
              <PendingLink href={`${base}/billing`} className="ghost sm btn-link">Plan and price →</PendingLink>
            </div>
          </div>

          <div className="pf-card">
            <h2>Their app</h2>
            <p>
              Open it as they see it, or read their books. Both are read-only unless you deliberately
              take control, and both are written to the trail where the owner can see them.
            </p>
            <div className="pf-actions">
              <PendingLink href={`${base}/reports`} className="primary btn-link">Open reports</PendingLink>
              <PendingLink href={`${base}/support`} className="ghost btn-link">Support access →</PendingLink>
            </div>
          </div>

          {/*
            Here because this is the tab somebody opens before a phone call,
            and "their prices are all in rupees" is one of the things that
            call is about. The café cannot change it from their own settings,
            so the answer and the way to fix it both have to be findable from
            here.
          */}
          <div className="pf-card">
            <h2>Trades in</h2>
            <p>
              <strong>{currency.name} ({currency.code})</strong> — prices on their till, menu board
              and receipts read {sample}.
            </p>
            <div className="pf-actions">
              <PendingLink href={`${base}/currency`} className="ghost sm btn-link">
                Change currency →
              </PendingLink>
            </div>
          </div>
        </div>

        <div className="pf-card">
          <h2>Recently</h2>
          <p>The last few things done to this café.</p>
          {recent.length === 0 ? (
            <p className="pf-hint">Nothing yet.</p>
          ) : (
            <>
              <ul className="audit-list">
                {recent.map((entry) => (
                  <li key={entry.id}>
                    <span className="audit-what">{entry.detail || entry.action}</span>
                    <span className="audit-when">{formatShortDateTime(entry.createdAt)}</span>
                    <span className="audit-who">{entry.actorEmail}</span>
                  </li>
                ))}
              </ul>
              <div className="pf-actions tenant-card-foot">
                <PendingLink href={`${base}/trail`} className="ghost sm btn-link">The whole trail →</PendingLink>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
