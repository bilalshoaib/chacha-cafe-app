import './globals.css'
import { AuthProvider } from '@/context/AuthContext.jsx'
import AppShell from '@/components/AppShell.jsx'

export const metadata = {
  title: 'Chacha Burger Cafe',
  description: 'POS & management system for Chacha Burger Cafe',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  )
}
