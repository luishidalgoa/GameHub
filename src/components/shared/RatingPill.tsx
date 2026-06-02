import { cn } from '@/lib/utils'
import { ratingBadge } from '@/lib/metadata/popularity'

const TONE: Record<'green' | 'yellow' | 'gray', string> = {
  green:  'bg-emerald-600/90 text-white',
  yellow: 'bg-amber-500/90 text-black',
  gray:   'bg-zinc-600/90 text-white',
}

interface Props {
  score?:      number | null   // precomputed unified 0–100 score (preferred)
  metacritic?: number | null
  rating?:     number | null
  className?:  string
  /** 'sm' for card corners, 'md' for the game page / modal tag row. */
  size?: 'sm' | 'md'
}

/**
 * Renders a game's score badge on a single 0–100 scale (metacritic when present,
 * else the player rating mapped ×20). Returns null when there's no score — so it
 * never adds noise to games without metrics. Shared by GameCard, the game page
 * and the detail modal.
 */
export function RatingPill({ score, metacritic, rating, className = '', size = 'sm' }: Props) {
  const badge = ratingBadge({ rawgScore: score, rawgMetacritic: metacritic, rawgRating: rating })
  if (!badge) return null

  const pad = size === 'md' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[10px]'
  return (
    <span
      className={cn('inline-flex items-center rounded-md font-semibold tabular-nums leading-none', TONE[badge.tone], pad, className)}
      title={badge.source === 'meta' ? `Metacritic ${badge.value}/100` : `Player rating ${badge.value}/100`}
    >
      {badge.value}
    </span>
  )
}
