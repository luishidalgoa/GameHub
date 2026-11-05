'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { consoleModelFor, withOrientation } from '@/lib/consoles'
import type { OrientationMap } from '@/lib/console-orientation'
import { WideRail } from './WideRail'
import { PlatformTile } from './PlatformTile'

/** Tiles that fit in one row at this window width, with the widths and gaps of the carousel. */
function visibleInRow(): number {
  const w = window.innerWidth
  const tile = w >= 1280 ? 240 : w >= 640 ? 220 : Math.min(0.46 * w, 240)
  const gutter = w >= 640 ? 48 : 32
  const sidebar = w >= 768 ? 56 : 0
  return Math.max(1, Math.floor((w - gutter - sidebar) / (tile + 16)))
}

/**
 * The consoles as a one-row carousel: the visible row plus three tiles, each with its live
 * model. The rest is on the consoles page, linked from the last tile.
 */
export function PlatformShowcase({ platforms, modelFiles, posterFiles, orientations, kicker, title }: {
  platforms: { slug: string; name: string; games: number; modelSlug: string }[]
  modelFiles: Record<string, string>
  posterFiles: Record<string, string>
  orientations: OrientationMap
  kicker: string
  title: string
}) {
  const t = useTranslations('Home')
  const shown = platforms.filter(p => p.games > 0)
  const [perRow, setPerRow] = useState(4)
  useEffect(() => {
    const measure = () => setPerRow(visibleInRow())
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  if (shown.length === 0) return null

  const rendered = Math.min(perRow + 3, shown.length)
  const more = rendered < shown.length

  return (
    <WideRail
      kicker={kicker}
      title={title}
      href={more ? '/explorar/consolas' : undefined}
      moreLabel={t('showAll')}
      moreVariant="square"
      itemClassName="w-[min(46vw,240px)] shrink-0 snap-start sm:w-[220px] xl:w-[240px]"
    >
      {shown.slice(0, rendered).map(p => {
        const base = consoleModelFor(p.modelSlug, modelFiles[p.modelSlug])
        const model = base && withOrientation(base, orientations)
        return (
          <PlatformTile
            key={p.slug}
            slug={p.slug}
            name={p.name}
            games={t('platformGames', { count: p.games })}
            model={model}
            poster={posterFiles[p.slug] ?? null}
            live
          />
        )
      })}
    </WideRail>
  )
}
