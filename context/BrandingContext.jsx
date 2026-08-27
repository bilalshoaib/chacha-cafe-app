'use client'
import { createContext, useContext } from 'react'

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
