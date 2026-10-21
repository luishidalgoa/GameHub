'use client'

import Link from 'next/link'
import type { GameGroup } from '@/lib/game-groups'
import { useStageHover } from './stage-hover'

/**
 * One game in a grid. A game with its own banner (fanart) keeps the wide shape of
 * the banner; a game without one shows its box art, whole and blurred behind, so
 * a box is never cropped into a banner it is not. The title sits under the image,
 * not over it, so nothing covers the art.
 */
export function GridTile({ group }: { group: GameGroup }) {
  const { game, platforms } = group
  const hover = useStageHover(game)
  const banner = game.fanart && game.image
  const names = platforms.map(p => p.name).join(' · ')

  return (
    <Link href={`/game/${game.id}`} {...hover}
          className="group mb-4 block break-inside-avoid overflow-hidden rounded-xl bg-white/[0.04] outline-none
            transition-transform duration-500 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-white/70">
      <div className={`relative overflow-hidden ${banner ? 'aspect-video' : 'aspect-[3/4]'}`}>
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.image!} alt="" loading="lazy" decoding="async"
               className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" />
        ) : game.cover ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={game.cover} alt="" loading="lazy" decoding="async"
                 className="absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-2xl saturate-150" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={game.cover} alt="" loading="lazy" decoding="async"
                 className="absolute inset-[6%] h-[88%] w-[88%] object-contain shadow-[0_14px_30px_-8px_rgba(0,0,0,0.8)] transition-transform duration-700 group-hover:scale-[1.03]" />
          </>
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
