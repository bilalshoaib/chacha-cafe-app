'use client'
import { businessTypeShortLabel, normalizeBusinessType } from '@/constants/businessTypes.js'

/** `partnerName` labels a partner kitchen's sale, which no fixed label covers. */
export default function BusinessTypeBadge({ type, className = '', partnerName = null }) {
  if (partnerName) return <span className={`badge-business badge-business-partner ${className}`.trim()}>{partnerName}</span>
  const t = type === 'both' ? 'both' : type === 'combined' ? 'combined' : normalizeBusinessType(type) || 'cafe'
  const label = businessTypeShortLabel(t)
  return <span className={`badge-business badge-business-${t} ${className}`.trim()}>{label}</span>
}
