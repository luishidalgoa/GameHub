import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ratingBadge } from '@/lib/metadata/popularity'

const TONE: Record<'green' | 'yellow' | 'gray', string> = {
  green:  'bg-emerald-600/90 text-white',
  yellow: 'bg-amber-500/90 text-black',
  gray:   'bg-zinc-600/90 text-white',
}

interface Props {
  metacritic?: number | null
  rating?:     number | null
  className?:  string
  /** 'sm' for card corners, 'md' for the game page tag row. */
  size?: 'sm' | 'md'
}

/**
 * Renders the rating badge for a game: metacritic (0–100) when present, else the
 * RAWG star rating (0–5). Returns null when there's no score — so it never adds
 * visual noise to games without metrics. Shared by GameCard and the game page.
 */
export function RatingPill({ metacritic, rating, className = '', size = 'sm' }: Props) {
  const badge = ratingBadge({ rawgMetacritic: metacritic, rawgRating: rating })
  if (!badge) return null

  const pad = size === 'md' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[10px]'
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 rounded-md font-semibold tabular-nums leading-none', TONE[badge.tone], pad, className)}
      title={badge.scale === 'meta' ? `Metacritic ${badge.value}` : `Rating ${badge.value}/5`}
    >
      {badge.scale === 'star' && <Star className="w-2.5 h-2.5" fill="currentColor" />}
      {badge.value}
    </span>
  )
}
