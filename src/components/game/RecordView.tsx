'use client'

import { useEffect } from 'react'
import { addRecentlyViewed } from '@/lib/recently-viewed'

/**
 * Records a game view in the per-device "recently viewed" history. Mounted on the
 * full game page (a server component), so navigations to /game/[id] from any link
 * (home strips, recommended, command palette…) get tracked. Renders nothing.
 */
export function RecordView({ gameId }: { gameId: number }) {
  useEffect(() => { addRecentlyViewed(gameId) }, [gameId])
  return null
}
