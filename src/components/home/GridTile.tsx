'use client'

import Link from 'next/link'
import type { GameGroup } from '@/lib/game-groups'
import { useStageHover } from './stage-hover'

/**
 * One game in a grid, drawn as its box art. The frame takes the proportions of the
 * game's own platform (a GBA box is square, a Switch box tall, a SNES box wide), so
 * a box fills its frame without cropping or empty margins. A game with no box art
 * falls back to its banner, then a screenshot, cropped to the same frame. The title
 * sits under the art, never over it.
 */
export function GridTile({ group }: { group: GameGroup }) {
  const { game, platforms } = group
  const hover = useStageHover(game)
  const art = game.cover ?? game.image
  const names = platforms.map(p => p.name).join(' · ')

  return (
    <Link href={`/game/${game.id}`} {...hover}
          className="group mb-4 block break-inside-avoid outline-none focus-visible:ring-2 focus-visible:ring-white/70">
      <div className="relative w-full overflow-hidden rounded-[3px] bg-white/[0.04] shadow-[0_16px_30px_-14px_rgba(0,0,0,0.8)] transition-transform duration-500 group-hover:-translate-y-1"
           style={{ aspectRatio: String(game.coverRatio) }}>
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt="" loading="lazy" decoding="async"
               className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-white/40">{game.title}</div>
        )}
      </div>

      <div className="px-1 pt-3">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{game.title}</p>
        <p className="mt-1 line-clamp-1 text-xs text-white/55">
          {names}{game.year ? ` · ${game.year}` : ''}
        </p>
      </div>
    </Link>
  )
}
