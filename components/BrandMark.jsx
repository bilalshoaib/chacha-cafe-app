'use client'
import { useBranding } from '@/context/BrandingContext.jsx'

/**
 * The tile beside the café's name in the header and on the sign-in page.
 *
 * The café's own logo when it has uploaded one, and otherwise the gradient
 * tile built from its two brand colours — which is what every café had before
 * logos existed and is still what most will have. That fallback is the reason
 * a logo can stay optional: a café without one looks finished rather than
 * broken, so nobody has to be chased for a PNG before they can start trading.
 *
 * Plain <img> rather than next/image: the source is a database-backed route
 * whose URL already carries a version stamp and is served immutable, so the
 * optimiser would add a hop and a second cache for a picture of a few tens of
 * kilobytes that is already cached for a year.
 */
export default function BrandMark() {
  const branding = useBranding()
  if (!branding?.logoUrl) return <span className="brand-mark" aria-hidden="true" />
  return (
    <span className="brand-mark brand-mark-logo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={branding.logoUrl} alt={`${branding.name} logo`} />
    </span>
  )
}
