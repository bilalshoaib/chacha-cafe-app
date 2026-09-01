'use client'
import { useState } from 'react'
import { useTenantConsole } from '@/context/TenantConsoleContext.jsx'
import { tenantAccess, trialDaysLeft, TRIAL_DAYS_DEFAULT, TRIAL_DAYS_MAX } from '@/lib/tenantAccess.js'
import { formatShortDateTime } from '@/utils/formatting.js'

/**
 * Whether this café can work, and the three ways it might not.
 *
 * A tab of its own, and it earned one the hard way: these controls first lived
 * at the bottom of a single page holding every action a café has, and when
 * that page was split they went onto Billing, below the plan and the price.
 * Somebody looking for "how do I stop this café" could not find it either
 * time. It is the question asked most often and under the most pressure — a
 * customer has not paid, or has rung up unable to sign in — so it gets the
 * word "Access" in the tab bar and nothing above it to scroll past.
 *
 * The trial sits here rather than with the plan for the same reason: a trial
 * running out is not a billing event, it is the café being locked out, and the
 * fix for it is two inches from the other two fixes.
 */
export default function TenantAccessPage() {
  const { tenant, patch, saving, destroy } = useTenantConsole()
  const [trialDays, setTrialDays] = useState(String(TRIAL_DAYS_DEFAULT))
  const [restrictReason, setRestrictReason] = useState('')
  const [confirmName, setConfirmName] = useState('')

  const access = tenantAccess(tenant)
  const daysLeft = trialDaysLeft(tenant)
  const onTrial = tenant.status === 'trial'
  const restricted = tenant.status === 'restricted'
  const suspended = tenant.status === 'suspended'

  return (
    <div className="tenant-tab-stack">
      {onTrial ? (
        <div className="pf-card">
          <h2>Trial</h2>
          {tenant.trialEndsAt ? (
            <p>
              {daysLeft > 0 ? (
                <>
                  Ends <strong>{formatShortDateTime(tenant.trialEndsAt)}</strong> — {daysLeft}{' '}
                  {daysLeft === 1 ? 'day' : 'days'} left. When it runs out everyone here is signed
                  out and cannot sign back in.
                </>
              ) : (
                <>
                  <strong>Ended {formatShortDateTime(tenant.trialEndsAt)}.</strong> Nobody at this
                  café can sign in. Extend it below, or move them onto a paid plan.
                </>
              )}
            </p>
          ) : (
            <p>This trial has no end date, so it runs until somebody stops it. Set a length below.</p>
          )}

          <div className="pf-actions pf-actions-inline">
            <label className="pf-field pf-field-inline">
              <span>Days from today</span>
              <input
                type="number"
                min={1}
                max={TRIAL_DAYS_MAX}
                value={trialDays}
                disabled={saving}
                onChange={(e) => setTrialDays(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="primary"
              disabled={saving || !trialDays}
              onClick={() => void patch(
                { trialDays: Number(trialDays) },
                `Trial now runs ${trialDays} more ${Number(trialDays) === 1 ? 'day' : 'days'}.`,
              )}
            >
              {tenant.trialEndsAt && daysLeft === 0 ? 'Restart trial' : 'Set trial length'}
            </button>
          </div>
        </div>
      ) : null}

      <div className={`pf-card ${access.allowed ? 'pf-card-danger' : 'pf-card-suspended'}`}>
        <h2>Access</h2>

        {restricted ? (
          <>
            <p>
              <strong>Paused for payment{tenant.restrictedAt ? ` since ${formatShortDateTime(tenant.restrictedAt)}` : ''}.</strong>{' '}
              Everyone here is signed out and cannot sign back in. They are shown:
            </p>
            <p className="pf-quoted">{access.message}</p>
          </>
        ) : suspended ? (
          <p>
            <strong>Suspended.</strong> Nobody at this café can sign in, and their public menu is
            off. Their data is untouched and comes back exactly as it was — restore it below, or
            delete it for good further down.
          </p>
        ) : !access.allowed ? (
          <p>
            <strong>Their trial has run out.</strong> Everyone here is signed out and cannot sign
            back in. Put time back on the clock above, or move them onto a paid plan below.
          </p>
        ) : (
          <p>
            Two ways to stop this café. <strong>Pause for payment</strong> is the one to use when an
            invoice is late — it says so, and names the reason you give. <strong>Suspend</strong> is
            the harder stop, and also takes their public menu down. Either one signs out everyone at
            this café within about half a minute — an idle till included, without anybody having to
            touch it — and tells them why. Nothing is deleted, and both can be undone.
          </p>
        )}

        {access.allowed ? (
          <label className="pf-field">
            <span>Reason to show them</span>
            <input
              value={restrictReason}
              disabled={saving}
              maxLength={200}
              placeholder="Invoice #41 is 21 days overdue"
              onChange={(e) => setRestrictReason(e.target.value)}
            />
            <span className="pf-hint">Shown on their sign-in screen. Optional, but it saves a phone call.</span>
          </label>
        ) : null}

        <div className="pf-actions">
          {access.allowed ? (
            <>
              <button
                type="button"
                className="ghost danger"
                disabled={saving}
                onClick={() => void patch(
                  { status: 'restricted', restrictedReason: restrictReason.trim() || undefined },
                  'Access paused for payment.',
                )}
              >
                Pause for payment
              </button>
              <button
                type="button"
                className="ghost danger"
                disabled={saving}
                onClick={() => void patch({ status: 'suspended' }, 'Café suspended.')}
              >
                Suspend café
              </button>
            </>
          ) : (
            <>
              {/* Restoring a café whose trial ran out has to put time back on
                  the clock, not merely set the status it already has —
                  otherwise the button appears to do nothing. */}
              <button
                type="button"
                className="primary"
                disabled={saving}
                onClick={() => void patch(
                  tenant.plan === 'trial'
                    ? { status: 'trial', trialDays: Number(trialDays) || TRIAL_DAYS_DEFAULT }
                    : { status: 'active' },
                  'Access restored.',
                )}
              >
                {tenant.plan === 'trial' ? 'Restore and restart trial' : 'Restore access'}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={saving || tenant.plan === 'standard'}
                onClick={() => void patch({ status: 'active', plan: 'standard' }, 'Moved onto the standard plan.')}
              >
                Move onto standard plan
              </button>
            </>
          )}
        </div>
      </div>

      {/* Only once suspended. Deleting a café that can still be signed into is
          how the wrong café gets deleted; suspension is the deliberate first
          step, and it has already taken the café dark. */}
      {suspended ? (
        <div className="pf-card pf-card-danger">
          <h2>Delete permanently</h2>
          <p>
            Erases this café and everything it holds — its menu, its invoices and expenses, its
            staff logins, open tabs, tax rates and shift history. <strong>This cannot be undone.</strong>{' '}
            What they have paid the platform stays on your books, and this trail is kept.
          </p>
          <label className="pf-field">
            <span>Type <strong>{tenant.name}</strong> to confirm</span>
            <input
              value={confirmName}
              disabled={saving}
              autoComplete="off"
              placeholder={tenant.name}
              onChange={(e) => setConfirmName(e.target.value)}
            />
          </label>
          <div className="pf-actions">
            <button
              type="button"
              className="ghost danger pf-delete-confirm"
              disabled={saving || confirmName.trim() !== tenant.name}
              onClick={() => void destroy(confirmName.trim())}
            >
              Delete this café and all its data
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
