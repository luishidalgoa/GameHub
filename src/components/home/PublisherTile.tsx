'use client'

import Link from 'next/link'
import type { TileGame } from '@/lib/home-data'
import { useStageHover } from './stage-hover'

/**
 * A publisher as a 16:9 tile: the art of its best games in three slanted
 * slices, which fan wider under the pointer, with the name over them.
 */
export function PublisherTile({ name, href, games, gamesLabel, samples }: {
  name: string
  href: string
  games: number
  gamesLabel: string
  samples: TileGame[]
}) {
  const lead = samples[0]
  const hover = useStageHover(lead ?? { palette: null, backdrop: null })
  const slices = samples.filter(s => s.image).slice(0, 3)

  return (
    <Link href={href} {...hover}
          className="group relative block aspect-video overflow-hidden rounded-xl bg-white/[0.05] outline-none transition-transform duration-500 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-white/70">
      <div className="absolute inset-0 flex">
        {slices.map((s, i) => (
          <div key={s.id}
               className="relative h-full flex-1 overflow-hidden transition-[flex-grow] duration-700 ease-out group-hover:[&:nth-child(2)]:flex-[1.6]"
               style={{ clipPath: 'polygon(14% 0, 100% 0, 86% 100%, 0 100%)', marginLeft: i === 0 ? 0 : '-6%' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.image!} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/20" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="text-2xl font-bold leading-none tracking-tight drop-shadow">{name}</p>
        <p className="mt-1.5 text-xs text-white/65">{gamesLabel}</p>
      </div>
    </Link>
  )
}
