'use client'

import useSWR from 'swr'
import { describeSlot, parseFeaturedOrder, type SlotPick } from '@/lib/featured-order'

/** Puestos que se ofrecen siempre; si el juego tiene uno mayor, también aparece. */
const SHOWN_SLOTS = 12

interface FeaturedPick extends SlotPick {
  platformName: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  gameId: number
  /** Valor del campo: un número como texto, o '' para el orden automático. */
  value: string
  /** Puesto que el juego tiene guardado hoy. */
  current: number | null
  /** Si el juego está marcado En portada; sin marca el puesto no cuenta. */
  featured: boolean
  inputClassName: string
  onChange: (value: string) => void
}

/**
 * Elige el puesto en portada viendo qué juego ocupa cada uno. Si el puesto lo
 * tiene otro destacado, al guardar los dos juegos se intercambian (lo hace el
 * servidor): el otro pasa al puesto que dejaba este juego.
 */
export function FeaturedSlotField({ gameId, value, current, featured, inputClassName, onChange }: Props) {
  const { data } = useSWR<FeaturedPick[]>('/api/admin/featured', fetcher, { revalidateOnFocus: false })
  const picks = data ?? []

  const order = parseFeaturedOrder(value)
  const { occupant, swapTo } = describeSlot(picks, gameId, order, current)

  const occupantOf = (n: number) => picks.find(p => p.featuredOrder === n)
  const labelOf = (n: number) => {
    const found = occupantOf(n)
    if (!found) return 'libre'
    return found.id === gameId ? 'este juego' : found.title
  }

  const top = Math.max(SHOWN_SLOTS, order ?? 0)
  const slots = Array.from({ length: top }, (_, i) => i + 1)

  return (
    <div className="space-y-1.5">
      <select
        aria-label="Puesto en portada"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName}
      >
        <option value="">Automático (por nota)</option>
        {slots.map(n => (
          <option key={n} value={String(n)}>{n} · {labelOf(n)}</option>
        ))}
      </select>
      {!featured && order !== null && (
        <p className="text-xs text-amber-200">Marca «En portada» para que el puesto cuente.</p>
      )}
      {featured && occupant && (
        <p className="text-xs text-amber-200">
          «{occupant.title}» pasará al puesto {swapTo ?? 'automático'}.
        </p>
      )}
    </div>
  )
}
