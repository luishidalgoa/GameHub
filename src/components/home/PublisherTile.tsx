'use client'

import Link from 'next/link'
import type { TileGame } from '@/lib/home-data'
import { useStageHover } from './stage-hover'

/**
 * A publisher as one tall tile, like the Xbox store's: a single piece of key art
 * from its best-rated game fills the tile and its name stands at the bottom.
 * The art is the game's own, cropped to the portrait shape.
 */
export function PublisherTile({ name, href, gamesLabel, samples }: {
  name: string
  href: string
  gamesLabel: string
  samples: TileGame[]
}) {
  const lead = samples.find(s => s.image) ?? samples[0]
  const hover = useStageHover(lead ?? { palette: null, backdrop: null })
  const tint = lead?.palette?.[0] ?? 'var(--art-a)'

  return (
    <Link href={href} {...hover} style={{ '--glow': tint } as React.CSSProperties}
          className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-white/[0.05] outline-none
            transition-[transform,box-shadow] duration-500 hover:-translate-y-1.5
            hover:shadow-[0_24px_50px_-20px_color-mix(in_srgb,var(--glow)_80%,transparent)]
            focus-visible:ring-2 focus-visible:ring-white/70">
      {lead?.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={lead.image} alt="" loading="lazy" decoding="async"
             className="absolute inset-0 h-full w-full object-cover object-[50%_30%] transition-transform duration-[900ms] ease-out group-hover:scale-110" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
      <div className="absolute inset-0 opacity-50 mix-blend-soft-light transition-opacity duration-500 group-hover:opacity-90"
           style={{ background: 'linear-gradient(to top, var(--glow), transparent 55%)' }} />
      <div className="absolute inset-x-0 bottom-0 p-4 text-center">
        <p className="text-balance text-xl font-black uppercase leading-tight tracking-tight drop-shadow-lg">{name}</p>
        <p className="mt-1.5 text-xs text-white/60">{gamesLabel}</p>
      </div>
    </Link>
  )
}
