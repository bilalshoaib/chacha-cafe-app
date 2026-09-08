import { cache } from 'react'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext.jsx'
import { ToastProvider } from '@/context/ToastContext.jsx'
import { BrandingProvider } from '@/context/BrandingContext.jsx'
import AppShell from '@/components/AppShell.jsx'
import Toaster from '@/components/Toaster.jsx'
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar.jsx'
import { getSession } from '@/lib/session'
import { getTenantBranding, brandingCssVars, DEFAULT_BRANDING } from '@/lib/tenantBranding'

export const icons = { icon: '/icon' }

/**
 * The tab title and description name whichever café is signed in, so the
 * browser tab of a white-labelled install does not advertise somebody else's
 * business. generateMetadata rather than a static export, because the answer
 * depends on the request.
 */
export async function generateMetadata() {
  const branding = await loadBranding()
  return {
    title: branding.name,
    description: `POS & management system for ${branding.name}`,
    icons: { icon: '/icon' },
  }
}

export async function generateViewport() {
  const branding = await loadBranding()
  // Tints the browser/OS chrome on mobile to match the café's own colour.
  return { themeColor: branding.primary }
}

/**
 * Resolves the café to present. A signed-out visitor has no tenant to read, so
 * they get the product's defaults — which is also what the single-tenant
 * install renders, unchanged.
 *
 * Wrapped in cache() because three things need the answer on every request —
 * the tab title, the theme colour and the page itself — and without it each
 * one asked the database separately. Over a connection outside Neon's region
 * that was most of a second spent three times over to render one page.
 */
const loadBranding = cache(async () => {
  try {
    const session = await getSession()
    // While a support session is open the app is showing that café, so it
    // should be wearing that café's name and colours rather than the platform
    // owner's own — which is none.
    const tenantId = session?.impersonatedTenantId || session?.tenantId
    return await getTenantBranding(tenantId)
  } catch {
    // A layout that cannot reach the database must still render the login
    // page, so branding failure falls back rather than throwing.
    return DEFAULT_BRANDING
  }
})

export default async function RootLayout({ children }) {
  const branding = await loadBranding()

  return (
    // The café's own language and writing direction.
    //
    // `dir` gets text, inputs, flexbox and grid mirrored for Arabic and Urdu
    // for free. It is not the whole of right-to-left support: app/styles still
    // positions with margin-left, padding-left and text-align: left in about
    // sixty places, and each of those stays on the wrong side until it becomes
    // a logical property. Correct for every left-to-right language, which is
    // all of them bar three in constants/locales.js.
    <html lang={branding.locale} dir={branding.direction}>
      <body suppressHydrationWarning>
        {/* The stylesheets derive every colour from these two custom
            properties, so a re-skin is these two values and nothing else. They
            now come from the tenants table rather than constants/theme.js,
            which remains the product's own palette and the fallback. */}
        <style>{brandingCssVars(branding)}</style>
        <BrandingProvider branding={branding}>
          <AuthProvider>
            <ToastProvider>
              {/* Inside AuthProvider because the screens worth caching are the
                  signed-in ones, so it waits to be told there is a session. */}
              <ServiceWorkerRegistrar />
              <AppShell>{children}</AppShell>
              <Toaster />
            </ToastProvider>
          </AuthProvider>
        </BrandingProvider>
      </body>
    </html>
  )
}
