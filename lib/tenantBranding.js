import { pool } from './db.js'
import { BRAND_PRIMARY, BRAND_SECONDARY } from '../constants/theme.js'
import { DEFAULT_DAY_START_HOUR, DEFAULT_DAY_END_HOUR } from './tradingDay.js'
import { DEFAULT_CURRENCY, DEFAULT_LOCALE, parseCurrency, localeForCurrency, directionOf } from '../constants/locales.js'

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
  // What this café trades in. It lives on the location rather than the tenant
  // — a business can open across a border — and it travels this road for the
  // same reason the trading hours do: every screen that shows a price needs
  // it, on the first paint, and a second query and a second provider to carry
  // one short string would be paid for on every navigation. The locale rides
  // along because it is derived from the currency and every formatter wants
  // the pair.
  currency: DEFAULT_CURRENCY,
  locale: DEFAULT_LOCALE,
  direction: 'ltr',
}

/**
 * How long a café's identity is remembered before it is read again.
 *
 * The root layout resolves branding on every request — the tab title, the
 * theme colour and the page all need it — so this query sat in front of every
 * screen the app renders. cache() already collapses the three uses within one
 * request into one query, but the next click paid for it again, and the answer
 * had not changed: a café is not renamed between one press of a tab and the
 * next. From outside Neon's region that was a ~261ms round trip added to every
 * navigation to be told the name it was told a moment ago.
 *
 * The same fifteen seconds as the access cache in tenantsRepository.js, which
 * exists for the same reason and against the same table. Per-instance, so the
 * worst case is a café renamed this second wearing its old name for a few
 * more; the writes below drop the entry, so the console and the café's own
 * settings screen see their change at once.
 */
const BRANDING_TTL_MS = 15_000
const brandingCache = new Map()

/**
 * Drops a café's remembered identity, so the next request reads it again.
 *
 * Called by every write that touches a branding column — the name, the
 * tagline, the colours, the receipt footer, the trading hours and the logo.
 * Miss one and that café keeps its old look for the life of the instance.
 */
export function forgetTenantBranding(tenantId) {
  brandingCache.delete(tenantId)
}

export async function getTenantBranding(tenantId) {
  if (!tenantId) return DEFAULT_BRANDING

  const hit = brandingCache.get(tenantId)
  if (hit && Date.now() - hit.at < BRANDING_TTL_MS) return hit.branding

  // The currency and language come from the tenant's first location by a
  // subquery rather than a join: a tenant with two branches must still produce
  // exactly one row here, and "the branch it opened with" is the answer the
  // rest of the app already uses for this (see tenantSummaries in
  // tenantsRepository.js). Per-branch currency is a real thing, but it belongs
  // to whatever ships the branch switcher, not to this query.
  const res = await pool.query(
    `SELECT t.name, t.tagline, t.brand_primary, t.brand_secondary, t.logo_url,
            t.receipt_footer, t.day_start_hour, t.day_end_hour,
            (SELECT l.currency FROM locations l
              WHERE l.tenant_id = t.id ORDER BY l.created_at LIMIT 1) AS currency,
            (SELECT l.locale FROM locations l
              WHERE l.tenant_id = t.id ORDER BY l.created_at LIMIT 1) AS locale
       FROM tenants t WHERE t.id = $1`,
    [tenantId],
  )
  const row = res.rows[0]
  // A café that is not there is remembered as absent too. Without that, an id
  // left on a cookie by a deleted café would ask the database for a row that
  // is never coming back, once per navigation, for as long as the tab is open.
  const branding = row
    ? {
        name: row.name || DEFAULT_BRANDING.name,
        tagline: row.tagline ?? DEFAULT_BRANDING.tagline,
        primary: row.brand_primary || DEFAULT_BRANDING.primary,
        secondary: row.brand_secondary || DEFAULT_BRANDING.secondary,
        logoUrl: row.logo_url ?? null,
        receiptFooter: row.receipt_footer ?? null,
        dayStartHour: row.day_start_hour == null ? DEFAULT_DAY_START_HOUR : Number(row.day_start_hour),
        dayEndHour: row.day_end_hour == null ? DEFAULT_DAY_END_HOUR : Number(row.day_end_hour),
        // Parsed rather than trusted. A café with no location row yet, or one
        // holding a code since dropped from the list, gets the default and a
        // rendered price instead of a crash at the till.
        //
        // The locale column is not read. It is derived from the currency, so a
        // row still holding a language somebody chose before the picker was
        // removed — ur-PK, es-MX — formats as the currency's market does and
        // the screen stays English, without a migration having to go and
        // rewrite the column first.
        currency: parseCurrency(row.currency),
        locale: localeForCurrency(row.currency),
        direction: directionOf(localeForCurrency(row.currency)),
      }
    : DEFAULT_BRANDING

  brandingCache.set(tenantId, { at: Date.now(), branding })
  return branding
}

/**
 * The bridge from the tenant's colours to the stylesheets, which build every
 * ramp, surface and shadow from these two custom properties. Mirrors
 * themeCssVars in constants/theme.js, which no longer has the last word.
 */
export function brandingCssVars({ primary, secondary }) {
  return `:root{--brand-primary:${primary};--brand-secondary:${secondary}}`
}
