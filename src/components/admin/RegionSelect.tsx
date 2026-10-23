'use client'

import { REGION_CODES, REGION_LABELS } from '@/lib/regions'

interface Props {
  value: string
  onChange: (value: string) => void
  className: string
}

/**
 * Región como lista cerrada. Un valor que no esté en la lista (un texto escrito
 * a mano antes de existir la lista) se conserva y se marca, para no perderlo al
 * guardar.
 */
export function RegionSelect({ value, onChange, className }: Props) {
  const known = REGION_CODES.includes(value)
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">Sin región</option>
      {value && !known && <option value={value}>{value} (no estándar)</option>}
      {REGION_CODES.map((code) => (
        <option key={code} value={code}>{REGION_LABELS[code]} ({code})</option>
      ))}
    </select>
  )
}
