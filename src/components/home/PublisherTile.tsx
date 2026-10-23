'use client'

import Link from 'next/link'
import type { PublisherTileData } from '@/lib/home-data'
import { useStage } from './HomeStage'
import { useRef } from 'react'
import { PublisherTileFace } from './PublisherTileFace'

/**
 * A publisher as one tall tile in the manner of the Xbox store: a custom
 * gradient, a character cut-out standing in it when the owner has uploaded one,
 * and the publisher's logo along the bottom. Without a character the logo takes
 * the middle of the tile; without a logo either, the name is set big. The face
 * is shared with the admin preview, so both draw the same tile.
 */
export function PublisherTile({ publisher, href, gamesLabel }: {
  publisher: PublisherTileData
  href: string
  gamesLabel: string
}) {
  const stage = useStage()
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const { colors } = publisher
  const [c1, c2] = [colors[0] ?? '#3a3a55', colors[1] ?? '#14141f']

  const enter = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => stage.show({ palette: colors.length ? colors : null, backdrop: publisher.character }), 140)
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
      <PublisherTileFace publisher={publisher} gamesLabel={gamesLabel} />
    </Link>
  )
}
