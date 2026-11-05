'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ViewerModel } from '@/lib/consoles'
import { ConsoleViewer } from './ConsoleViewer'
import { PlatformIcon } from '@/components/shared/PlatformIcon'

/**
 * One console: its model floats above the name. The model is live in a row that shows it
 * (`live`), and otherwise only while the pointer is over the tile, so a grid of consoles
 * loads one model at a time.
 */
export function PlatformTile({ slug, name, games, model, poster = null, live = false }: {
  slug: string
  name: string
  games: string
  model: ViewerModel | null
  /** Still image shown while the model is not live: the PNG made from the model's front. */
  poster?: string | null
  live?: boolean
}) {
  const [hover, setHover] = useState(false)
  const showModel = !!model && (live || hover)
  return (
    <Link
      href={`/platform/${slug}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group relative block rounded-2xl pb-5 pt-2 outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      <div className="relative mx-auto aspect-square w-full max-w-[220px]">
        <div className="absolute inset-[18%] rounded-full opacity-0 blur-2xl transition-opacity duration-700 group-hover:opacity-70"
             style={{ background: 'radial-gradient(circle, var(--art-a), transparent 70%)' }} />
        {showModel && model && <ConsoleViewer model={model} className="absolute inset-0" />}
        {!showModel && (poster
          ? <img src={poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
          : <div className="absolute inset-0 grid place-items-center opacity-60"><PlatformIcon slug={slug} iconPath={null} size={72} /></div>)}
      </div>
      <div className="px-2 text-center">
        <p className="text-lg font-semibold tracking-tight transition-transform duration-500 group-hover:-translate-y-0.5">{name}</p>
        <p className="mt-0.5 text-sm text-white/50">{games}</p>
      </div>
    </Link>
  )
}
