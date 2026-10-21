'use client'

import Link from 'next/link'
import type { TileGame } from '@/lib/home-data'
import { Reveal } from './Reveal'
import { useStageHover } from './stage-hover'

/**
 * The owner's picks as a wall of three columns. Each column holds two tiles, and
 * hovering one makes it grow at the expense of the other in its column, so the
 * wall reshapes under the pointer instead of lifting a card. The columns are
 * unequal on purpose. On a phone the wall is a plain stack and nothing grows.
 */
export function FeaturedWall({ games, kicker, title, cta }: {
  games: TileGame[]
  kicker: string
  title: string
  cta: string
}) {
  if (games.length === 0) return null
  const columns = [games.slice(0, 2), games.slice(2, 4), games.slice(4, 6)].filter(c => c.length > 0)
  const widths = ['md:[flex:1.15_1_0]', 'md:[flex:1_1_0]', 'md:[flex:0.9_1_0]']

  return (
    <Reveal as="section">
      <div className="mb-4 px-4 sm:px-6">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] art-kicker">{kicker}</p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      </div>
      <div className="flex flex-col gap-3 px-4 sm:px-6 md:h-[600px] md:flex-row">
        {columns.map((col, c) => (
          <div key={c} className={`flex flex-col gap-3 ${widths[c]} ${c === 1 ? 'md:pt-8' : ''}`}>
            {col.map(g => <WallTile key={g.id} game={g} cta={cta} />)}
          </div>
        ))}
      </div>
    </Reveal>
  )
}

function WallTile({ game, cta }: { game: TileGame; cta: string }) {
  const hover = useStageHover(game)
  return (
    <Link
      href={`/game/${game.id}`}
      {...hover}
      className="group relative min-h-[220px] flex-1 overflow-hidden rounded-2xl bg-white/[0.04] outline-none
        transition-[flex-grow] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]
        md:[flex:1_1_0] md:hover:[flex:2.3_1_0] md:focus-visible:[flex:2.3_1_0]
        focus-visible:ring-2 focus-visible:ring-white/70"
    >
      {game.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={game.image} alt="" loading="lazy" decoding="async"
             className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-110" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/10" />
      <div className="absolute inset-0 opacity-0 mix-blend-soft-light transition-opacity duration-700 group-hover:opacity-100"
           style={{ background: `linear-gradient(160deg, ${game.palette?.[0] ?? 'var(--art-a)'}, transparent 70%)` }} />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5">
        {game.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.logo} alt={game.title} className="max-h-14 w-auto max-w-[75%] self-start object-contain drop-shadow-lg" />
        ) : (
          <p className="text-xl font-bold leading-tight tracking-tight drop-shadow">{game.title}</p>
        )}
        <p className="text-xs text-white/65">{[game.platformName, game.genre, game.year].filter(Boolean).join(' · ')}</p>
        {/* Grows into view with the tile: hidden until it is the wide one. */}
        <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-700 group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr]">
          <div className="overflow-hidden">
            {game.description && <p className="line-clamp-3 pt-1 text-sm leading-relaxed text-white/75">{game.description}</p>}
            <p className="pt-3 text-sm font-semibold">{cta} →</p>
          </div>
        </div>
      </div>
    </Link>
  )
}
