'use client'

import type { ViewerModel } from '@/lib/consoles'
import { PlatformTile } from './PlatformTile'

/** Every console in a grid. A model loads only while the pointer is over its tile. */
export function ConsoleGrid({ tiles }: {
  tiles: { slug: string; name: string; games: string; model: ViewerModel | null; poster: string | null }[]
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {tiles.map(t => (
        <PlatformTile key={t.slug} slug={t.slug} name={t.name} games={t.games} model={t.model} poster={t.poster} />
      ))}
    </div>
  )
}
