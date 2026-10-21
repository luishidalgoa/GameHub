'use client'

import Link from 'next/link'
import type { PublisherTileData } from '@/lib/home-data'
import { useStage } from './HomeStage'
import { useRef } from 'react'

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
  const { name, logo, plainLogo, character, colors } = publisher
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
      {/* The gradient: a lit corner over a deep base, with a soft vertical bloom behind the figure. */}
      <div className="absolute inset-0" style={{
        background: `radial-gradient(120% 70% at 85% 0%, color-mix(in srgb, var(--c1) 100%, white 22%), transparent 60%),
                     radial-gradient(90% 60% at 20% 55%, color-mix(in srgb, var(--c1) 70%, transparent), transparent 70%),
                     linear-gradient(170deg, var(--c1), var(--c2))`,
      }} />
      <div className="absolute inset-0 opacity-[0.12] mix-blend-overlay"
           style={{ backgroundImage: 'repeating-linear-gradient(115deg, #fff 0 1px, transparent 1px 14px)' }} />

      {character && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={character} alt="" loading="lazy" decoding="async"
             className="absolute bottom-[16%] left-1/2 h-[80%] w-auto max-w-[110%] -translate-x-1/2 object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)] transition-transform duration-[900ms] ease-out group-hover:-translate-y-1 group-hover:scale-[1.07]" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/10" />
      {/* Behind a centered logo: a soft dark pool, so a pale logo reads on any gradient. */}
      {logo && !character && (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 34% at 50% 50%, rgba(0,0,0,0.45), transparent)' }} />
      )}

      {logo ? (
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
