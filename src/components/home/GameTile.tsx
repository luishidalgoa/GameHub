'use client'

import Link from 'next/link'
import type { TileGame } from '@/lib/home-data'
import { useStageHover } from './stage-hover'
import { NearScreen } from './NearScreen'

/**
 * One game as a 16:9 tile. Every tile has the same shape whatever art the game
 * has: fanart or a screenshot fills it; with neither, the box art is blurred to
 * fill the tile and shown whole in front, so a tall or square box never gets
 * stretched or letterboxed into a different-looking tile.
 */
export function GameTile({ game, className = '', priority = false }: {
  game: TileGame
  className?: string
  priority?: boolean
}) {
  const hover = useStageHover(game)
  const glow = game.palette?.[0] ?? 'var(--art-a)'

  return (
    <Link
      href={`/game/${game.id}`}
      {...hover}
      style={{ '--glow': glow } as React.CSSProperties}
      className={`group relative block aspect-video overflow-hidden rounded-xl bg-white/[0.04] outline-none
        transition-[transform,box-shadow] duration-500 ease-out
        hover:-translate-y-1 focus-visible:-translate-y-1
        hover:shadow-[0_22px_50px_-20px_color-mix(in_srgb,var(--glow)_75%,transparent)]
        focus-visible:ring-2 focus-visible:ring-white/70 ${className}`}
    >
      {game.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={game.image} alt="" loading={priority ? 'eager' : 'lazy'} decoding="async"
             className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.07]" />
      ) : game.cover ? (
        <>
          {/* No fanart or screenshot: the box art is blurred into a backdrop and shown whole in front
              of it, over a wash of the page theme and the platform's name as a faint watermark. */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--art-a) 35%, #0a0a12), color-mix(in srgb, var(--art-b) 30%, #0a0a12))' }} />
          <NearScreen className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={game.cover} alt="" loading="lazy" decoding="async"
                 className="absolute inset-0 h-full w-full scale-150 object-cover opacity-40 blur-3xl saturate-150" />
          </NearScreen>
          <span aria-hidden className="absolute -left-2 -top-3 select-none text-[56px] font-black uppercase leading-none tracking-tighter text-white/[0.07]">
            {game.platformName}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={game.cover} alt="" loading="lazy" decoding="async"
               className="absolute left-1/2 top-[44%] h-[74%] w-auto max-w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-[3px] object-contain shadow-[0_18px_36px_-8px_rgba(0,0,0,0.75)] transition-transform duration-700 group-hover:scale-105" />
        </>
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent opacity-90 transition-opacity duration-500 group-hover:opacity-100" />

      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <p className="line-clamp-2 text-[15px] font-semibold leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">{game.title}</p>
        <p className="mt-1 text-xs text-white/65">
          {game.platformName}{game.year ? ` · ${game.year}` : ''}
        </p>
      </div>
    </Link>
  )
}
