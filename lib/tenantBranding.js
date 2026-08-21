import { pool } from './db.js'
import { BRAND_PRIMARY, BRAND_SECONDARY } from '../constants/theme.js'

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
  name: 'Chacha Burger & Cafe',
  tagline: 'Good Food ★ Good Mood',
  primary: BRAND_PRIMARY,
  secondary: BRAND_SECONDARY,
  logoUrl: null,
  receiptFooter: null,
}

export async function getTenantBranding(tenantId) {
  if (!tenantId) return DEFAULT_BRANDING
  const res = await pool.query(
    `SELECT name, tagline, brand_primary, brand_secondary, logo_url, receipt_footer
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
