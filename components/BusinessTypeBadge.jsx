'use client'
import { businessTypeShortLabel, normalizeBusinessType } from '@/constants/businessTypes.js'

export default function BusinessTypeBadge({ type, className = '' }) {
  const t = type === 'both' ? 'both' : type === 'combined' ? 'combined' : normalizeBusinessType(type) || 'cafe'
  const label = businessTypeShortLabel(t)
  return <span className={`badge-business badge-business-${t} ${className}`.trim()}>{label}</span>
}
