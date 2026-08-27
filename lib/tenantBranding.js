import { pool } from './db.js'
import { BRAND_PRIMARY, BRAND_SECONDARY } from '../constants/theme.js'
import { DEFAULT_DAY_START_HOUR, DEFAULT_DAY_END_HOUR } from './tradingDay.js'

/**
 * The identity a café presents: its name, its colours, what the receipt says
 * at the bottom.
 *
 * constants/theme.js stays as the product's own palette and is what a tenant
 * falls back to before it has chosen anything — so a café created with no
 * branding looks deliberate rather than broken, and the single-tenant install
 * renders exactly as it does today.
 *
 * Read outside withTenant(): the layout needs this before it knows whether
 * anyone is signed in, and the tenants table carries no RLS for that reason.
 */
export const DEFAULT_BRANDING = {
  // The product's own name, shown where no café applies: the sign-in page
  // before anyone is known, and the platform console, which belongs to nobody's
  // café. It must not be a customer's name — the console was rendering
  // "Chacha Burger & Cafe" above a list that had Chacha as one row in it.
  //
  // TODO: this is a working title. The product needs a real name before it is
  // shown to a second customer.
  name: 'Cafe POS',
  tagline: null,
  primary: BRAND_PRIMARY,
  secondary: BRAND_SECONDARY,
  logoUrl: null,
  receiptFooter: null,
  // Not branding, strictly, but it travels the same road: resolved from the
  // same row, on the same request, into the same client context. The reports
  // screen needs to know when this café's day turns over before it can say
  // what "today" means, and the alternative was a second query and a second
  // provider to carry two integers.
  dayStartHour: DEFAULT_DAY_START_HOUR,
  dayEndHour: DEFAULT_DAY_END_HOUR,
}

export async function getTenantBranding(tenantId) {
  if (!tenantId) return DEFAULT_BRANDING
  const res = await pool.query(
    `SELECT name, tagline, brand_primary, brand_secondary, logo_url, receipt_footer,
            day_start_hour, day_end_hour
       FROM tenants WHERE id = $1`,
    [tenantId],
  )
  const row = res.rows[0]
  if (!row) return DEFAULT_BRANDING
  return {
    name: row.name || DEFAULT_BRANDING.name,
    tagline: row.tagline ?? DEFAULT_BRANDING.tagline,
    primary: row.brand_primary || DEFAULT_BRANDING.primary,
    secondary: row.brand_secondary || DEFAULT_BRANDING.secondary,
    logoUrl: row.logo_url ?? null,
    receiptFooter: row.receipt_footer ?? null,
    dayStartHour: row.day_start_hour == null ? DEFAULT_DAY_START_HOUR : Number(row.day_start_hour),
    dayEndHour: row.day_end_hour == null ? DEFAULT_DAY_END_HOUR : Number(row.day_end_hour),
  }
}

/**
 * The bridge from the tenant's colours to the stylesheets, which build every
 * ramp, surface and shadow from these two custom properties. Mirrors
 * themeCssVars in constants/theme.js, which no longer has the last word.
 */
export function brandingCssVars({ primary, secondary }) {
  return `:root{--brand-primary:${primary};--brand-secondary:${secondary}}`
}
