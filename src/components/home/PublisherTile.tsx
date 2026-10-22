'use client'

import Link from 'next/link'
import type { PublisherTileData } from '@/lib/home-data'
import { useStage } from './HomeStage'
import { useRef } from 'react'
import { BRAND_STYLE } from '@/lib/publisher-style'
import { PublisherBackdrop } from './PublisherBackdrop'
import type { Place } from '@/lib/publisher-art'

/** An element the owner placed: its centre, and its box in percent of the tile. */
const placed = (p: Place): React.CSSProperties => ({
  position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
  width: p.w !== undefined ? `${p.w}%` : 'auto',
  height: p.h !== undefined ? `${p.h}%` : 'auto',
  maxWidth: 'none', transform: 'translate(-50%, -50%)',
})

/**
 * A publisher as one tall tile in the manner of the Xbox store: a custom
 * gradient, a character cut-out standing in it when the owner has uploaded one,
 * and the publisher's logo in white along the bottom. Without a character the
 * logo takes the middle of the tile; without a logo either, the name is set big.
 */
export function PublisherTile({ publisher, href, gamesLabel }: {
  publisher: PublisherTileData
  href: string
  gamesLabel: string
}) {
  const stage = useStage()
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const { name, logo, plainLogo, character, colors, layout } = publisher
  const [c1, c2] = [colors[0] ?? '#3a3a55', colors[1] ?? '#14141f']

  const enter = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => stage.show({ palette: colors.length ? colors : null, backdrop: character }), 140)
  }
  const leave = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => stage.show(null), 420)
  }

  return (
    <Link href={href} onPointerEnter={enter} onPointerLeave={leave} onFocus={enter} onBlur={leave}
          style={{ '--c1': c1, '--c2': c2 } as React.CSSProperties}
          className="group relative block aspect-[3/4] overflow-hidden rounded-xl outline-none
            transition-[transform,box-shadow] duration-500 hover:-translate-y-1.5
            hover:shadow-[0_24px_50px_-20px_color-mix(in_srgb,var(--c1)_85%,transparent)]
            focus-visible:ring-2 focus-visible:ring-white/70">
      <PublisherBackdrop style={BRAND_STYLE[publisher.key] ?? 'smoke'} c1={c1} c2={c2} id={`pt-${publisher.key.replace(/[^a-z0-9]/g, '')}`} />

      {character && layout?.character && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={character} alt="" loading="lazy" decoding="async" style={placed(layout.character)}
             className="object-cover object-top drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)] transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]" />
      )}
      {character && !layout?.character && (
        // Cut at the chest, the way the store does it: the top of the figure is
        // kept, the rest runs off the bottom of the tile behind the logo.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={character} alt="" loading="lazy" decoding="async"
             className="absolute inset-x-[8%] top-[9%] bottom-[25%] h-auto w-[84%] max-w-none object-cover object-top drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)] transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/10" />
      {/* Behind a centered logo: a soft dark pool, so a pale logo reads on any gradient. */}
      {logo && !character && (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 34% at 50% 50%, rgba(0,0,0,0.45), transparent)' }} />
      )}

      {logo && layout?.logo ? (
        // The owner placed the logo: it keeps its place, and the name line goes under it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={name} loading="lazy" decoding="async" style={placed(layout.logo)}
             className={`object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] ${plainLogo ? '' : 'brightness-0 invert'}`} />
      ) : logo ? (
        <div className={`absolute inset-x-0 flex flex-col items-center px-5 text-center ${character ? 'bottom-4' : 'inset-y-0 justify-center'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={name} loading="lazy" decoding="async"
               className={`max-w-[82%] object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] ${plainLogo ? '' : 'brightness-0 invert'} ${character ? 'w-auto max-h-8' : 'max-h-28 w-[82%] transition-transform duration-700 group-hover:scale-105'}`} />
          <p className="mt-2 text-xs text-white/60">{gamesLabel}</p>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 p-4 text-center">
          <p className="text-balance text-2xl font-black uppercase leading-none tracking-tight drop-shadow-lg">{name}</p>
          <p className="mt-2 text-xs text-white/60">{gamesLabel}</p>
        </div>
      )}
    </Link>
  )
}
