'use client'

import Link from 'next/link'
import type { GameGroup } from '@/lib/game-groups'
import { useStageHover } from './stage-hover'

/**
 * One game in a grid, drawn as its box art inside a glass card. The art fills its
 * frame edge to edge, in the proportions of the game's own platform (a GBA box is
 * square, a Switch box tall, a SNES box wide); the card around it holds the title,
 * so the text reads as part of the cover. A game with no box art falls back to its
 * banner, then a screenshot, in the same frame.
 */
export function GridTile({ group }: { group: GameGroup }) {
  const { game, platforms } = group
  const hover = useStageHover(game)
  const art = game.cover ?? game.image
  const names = platforms.map(p => p.name).join(' · ')

  return (
    <Link href={`/game/${game.id}`} {...hover}
          className="group mb-4 block break-inside-avoid overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] shadow-[0_18px_36px_-18px_rgba(0,0,0,0.85)] backdrop-blur-xl outline-none transition-[transform,border-color] duration-500 hover:-translate-y-1 hover:border-white/25 focus-visible:ring-2 focus-visible:ring-white/70">
      <div className="relative w-full overflow-hidden bg-black/30" style={{ aspectRatio: String(game.coverRatio) }}>
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt="" loading="lazy" decoding="async"
               className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-white/40">{game.title}</div>
        )}
      </div>

      <div className="px-3.5 py-3">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{game.title}</p>
        <p className="mt-1 line-clamp-1 text-xs text-white/55">
          {names}{game.year ? ` · ${game.year}` : ''}
        </p>
      </div>
    </Link>
  )
}
