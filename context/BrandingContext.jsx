'use client'
import { createContext, useContext, useMemo } from 'react'
import { moneyFormatter, formatShortDateTime } from '@/utils/formatting.js'
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from '@/constants/locales.js'

const BrandingContext = createContext(null)

/**
 * Carries the café's identity to the client components that display it — the
 * header, the login page, the printed receipt.
 *
 * The value is resolved on the server in app/layout.jsx and passed down, so
 * there is no second fetch and no flash of the wrong name on first paint.
 */
export function BrandingProvider({ branding, children }) {
  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>
}

export function useBranding() {
  return useContext(BrandingContext)
}

/**
 * A money formatter already bound to the café being shown.
 *
 * This exists because the alternative was passing `{ locale, currency }` to
 * every one of the forty-odd formatMoney calls in the app, where forgetting one
 * is invisible in review and shows up as a single price in rupees on an
 * otherwise dollar screen. A component asks for `money` and cannot get it
 * wrong.
 *
 * Returns the default formatter when there is no provider above it, which is
 * what the sign-in page and the platform console get — neither is showing a
 * café's prices.
 */
export function useMoney() {
  const branding = useContext(BrandingContext)
  const locale = branding?.locale ?? DEFAULT_LOCALE
  const currency = branding?.currency ?? DEFAULT_CURRENCY
  // moneyFormatter caches on the pair, so this memo is about identity rather
  // than cost: an unstable `money` would re-render every memoised row that
  // takes it as a prop.
  return useMemo(() => moneyFormatter({ locale, currency }), [locale, currency])
}

/**
 * The café's language, and the date formatter that goes with it.
 *
 * Separate from useMoney because a screen that shows timestamps and no prices
 * should not have to reach for a currency to get them, and vice versa.
 */
export function useLocale() {
  const branding = useContext(BrandingContext)
  const locale = branding?.locale ?? DEFAULT_LOCALE
  const direction = branding?.direction ?? 'ltr'
  return useMemo(
    () => ({
      locale,
      direction,
      formatDateTime: (value) => formatShortDateTime(value, { locale }),
    }),
    [locale, direction],
  )
}
