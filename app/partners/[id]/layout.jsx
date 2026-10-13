'use client'
import { use } from 'react'
import { PartnerTillProvider } from '@/components/PartnerTill.jsx'

/**
 * Holds a partner kitchen's cart across its two till views — /partners/[id]
 * (classic) and /partners/[id]/quick (tiles) — so switching between them keeps
 * the order, as the café's own two tills do.
 */
export default function PartnerLayout({ params, children }) {
  const { id } = use(params)
  return <PartnerTillProvider partnerId={id}>{children}</PartnerTillProvider>
}
