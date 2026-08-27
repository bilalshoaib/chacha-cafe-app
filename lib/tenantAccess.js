/**
 * Whether a café may currently be used, and what to tell them if not.
 *
 * The one definition of it. Three places need the answer — the login route,
 * every request that reaches requireTenant(), and the console that shows the
 * platform owner what state a café is in — and three implementations of a
 * billing rule would disagree within a month.
 *
 * Deliberately pure: it takes a tenant row and a clock and returns a verdict,
 * with no database import of its own. That is what lets the unit tests pin the
 * edges of a trial down to the second without a database.
 */

/** How long a new trial runs when nobody says otherwise. */
export const TRIAL_DAYS_DEFAULT = 14

/** The longest a trial can be set to, so a typo cannot grant one for ever. */
export const TRIAL_DAYS_MAX = 365

export const ACCESS_REASONS = ['suspended', 'restricted', 'trial_expired']

function endOfTrialMessage(at) {
  const when = at ? new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  return when
    ? `This café’s trial ended on ${when}. Please contact support to continue.`
    : 'This café’s trial has ended. Please contact support to continue.'
}

/**
 * The verdict on one café.
 *
 * `tenant` is a row as rowToTenant() returns it — status, and the two dates.
 * A tenant that cannot be found is refused rather than allowed: a missing café
 * is not an unrestricted one.
 */
export function tenantAccess(tenant, now = Date.now()) {
  if (!tenant) {
    return { allowed: false, reason: 'suspended', message: 'This account is no longer available. Please contact support.' }
  }

  if (tenant.status === 'suspended') {
    return {
      allowed: false,
      reason: 'suspended',
      message: 'This account is currently suspended. Please contact support.',
    }
  }

  if (tenant.status === 'restricted') {
    // The reason is written by the platform owner and shown to the café, so it
    // is the place to say "invoice #41 is three weeks overdue" rather than
    // leaving somebody at a till guessing.
    return {
      allowed: false,
      reason: 'restricted',
      message: tenant.restrictedReason
        ? `Access is paused: ${tenant.restrictedReason}`
        : 'Access is paused pending payment. Please contact support.',
    }
  }

  // An expired trial blocks whatever the status column says, so long as the
  // café is still on a trial. Moving them onto a paid plan is what lifts it,
  // which is the same action that would be taken on being paid.
  if (tenant.status === 'trial' && tenant.trialEndsAt) {
    const endsAt = new Date(tenant.trialEndsAt).getTime()
    if (Number.isFinite(endsAt) && now >= endsAt) {
      return { allowed: false, reason: 'trial_expired', message: endOfTrialMessage(tenant.trialEndsAt) }
    }
  }

  return { allowed: true, reason: null, message: null }
}

/**
 * Whole days left on a trial, or null for a café that is not on one.
 *
 * Rounded up, because a trial with four hours left has a day left as far as
 * anybody reading the console is concerned — and showing "0 days" beside a
 * café that still works reads as a bug.
 */
export function trialDaysLeft(tenant, now = Date.now()) {
  if (!tenant || tenant.status !== 'trial' || !tenant.trialEndsAt) return null
  const ms = new Date(tenant.trialEndsAt).getTime() - now
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

/** `days` from now as an ISO timestamp, or an error message. */
export function trialEndFromDays(days) {
  const n = Number(days)
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < 1 || n > TRIAL_DAYS_MAX) {
    return { error: `Trial length must be a whole number of days between 1 and ${TRIAL_DAYS_MAX}.` }
  }
  return { value: new Date(Date.now() + n * 86_400_000).toISOString() }
}
