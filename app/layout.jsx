import './globals.css'
import { AuthProvider } from '@/context/AuthContext.jsx'
import { ToastProvider } from '@/context/ToastContext.jsx'
import AppShell from '@/components/AppShell.jsx'
import Toaster from '@/components/Toaster.jsx'

export const metadata = {
  title: 'Chacha Burger Cafe',
  description: 'POS & management system for Chacha Burger Cafe',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
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
