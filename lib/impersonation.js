/**
 * What counts as a live support session — the one definition of it.
 *
 * Deliberately free of `next/headers` and of any database import, because
 * middleware runs in the edge runtime and has to be able to ask this question
 * too. It used to answer it for itself, checking only that
 * `impersonatedTenantId` was set while the app also checked that the session
 * had not run out. The two disagreed for exactly as long as an expired
 * impersonation sat on a cookie: middleware waved the platform owner through
 * to a café's screens, requireTenant() then resolved no tenant, and AppShell
 * rendered the café pages outside OrdersProvider — so the till crashed with
 * "useOrders must be used within OrdersProvider" instead of redirecting.
 */

/** How long a support session lasts before it drops back on its own. */
export const IMPERSONATION_MINUTES = 30

/**
 * The impersonation on this session, if there is one that has not run out.
 *
 * Support sessions expire on their own. Left open they become a standing
 * ability to read a customer's books that nobody remembers granting, and the
 * likeliest way that happens is a tab left open rather than anything
 * deliberate.
 */
export function activeImpersonation(session) {
  if (!session?.impersonatedTenantId || !session?.platformOwner) return null
  if (!session.impersonationExpiresAt || Date.now() > session.impersonationExpiresAt) return null
  return {
    tenantId: session.impersonatedTenantId,
    tenantName: session.impersonatedTenantName,
    control: Boolean(session.impersonationControl),
    expiresAt: session.impersonationExpiresAt,
  }
}
