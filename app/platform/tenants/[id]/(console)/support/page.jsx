'use client'
import { useTenantConsole } from '@/context/TenantConsoleContext.jsx'

/** Getting into a café's app, and getting its owner back into theirs. */
export default function TenantSupportPage() {
  const { tenant, saving, openAs, resetPassword, issued } = useTenantConsole()

  return (
    <div className="tenant-tab-stack">
      <div className="pf-card">
        <h2>Support access</h2>
        <p>
          Opens the app as this café so you can see what they see. Read-only unless you deliberately
          take control, limited to 30 minutes, and written to the trail where the owner can see it.
        </p>
        <div className="pf-actions">
          <button type="button" className="primary" disabled={saving} onClick={() => void openAs(false)}>
            Open read-only
          </button>
          <button type="button" className="ghost danger" disabled={saving} onClick={() => void openAs(true)}>
            Open and take control
          </button>
        </div>
      </div>

      <div className="pf-card">
        <h2>Owner sign-in</h2>
        <p>
          {tenant.ownerEmail
            ? <>Their account is <code>{tenant.ownerEmail}</code>. The stored password is a hash and cannot be read back, so the way to get one is to issue a new one — the same thing that happens when a customer forgets theirs. It appears here once and is written to the trail.</>
            : 'This café has no owner account.'}
        </p>
        {issued ? (
          <dl className="handover">
            <dt>Sign in with</dt>
            <dd><code>{issued.email}</code></dd>
            <dt>New password</dt>
            <dd><code className="handover-password">{issued.temporaryPassword}</code></dd>
          </dl>
        ) : null}
        {tenant.ownerEmail ? (
          <div className="pf-actions">
            <button type="button" className="ghost" disabled={saving} onClick={() => void resetPassword()}>
              {issued ? 'Issue another' : 'Issue a new password'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
