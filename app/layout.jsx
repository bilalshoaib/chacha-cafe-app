import './globals.css'
import { AuthProvider } from '@/context/AuthContext.jsx'
import { ToastProvider } from '@/context/ToastContext.jsx'
import AppShell from '@/components/AppShell.jsx'
import Toaster from '@/components/Toaster.jsx'
import { BRAND_PRIMARY, themeCssVars } from '@/constants/theme.js'

export const metadata = {
  title: 'Chacha Burger Cafe',
  description: 'POS & management system for Chacha Burger Cafe',
  // Generated from the theme source — see app/icon/route.js.
  icons: { icon: '/icon' },
}

// Tints the browser/OS chrome on mobile to match the theme.
export const viewport = {
  themeColor: BRAND_PRIMARY,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {/* The stylesheets derive every colour from these two custom
            properties. They are injected here instead of being written in CSS
            so constants/theme.js stays the single place a re-skin happens —
            no .css file declares them, so there is nothing to conflict with. */}
        <style>{themeCssVars}</style>
        <AuthProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
            <Toaster />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
