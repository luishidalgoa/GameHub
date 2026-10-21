'use client'

import { useCallback, useRef } from 'react'
import { useStage } from './HomeStage'
import type { TileGame } from '@/lib/home-data'

/**
 * Pointer handlers that theme the whole page after a game while it is hovered.
 * Entering waits a moment and leaving waits a little longer, so sweeping across
 * a row of tiles does not make the page flicker through every palette.
 */
export function useStageHover(game: Pick<TileGame, 'palette' | 'backdrop'>) {
  const stage = useStage()
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const enter = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => stage.show({ palette: game.palette, backdrop: game.backdrop }), 140)
  }, [stage, game.palette, game.backdrop])

  const leave = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => stage.show(null), 420)
  }, [stage])

  return { onPointerEnter: enter, onPointerLeave: leave, onFocus: enter, onBlur: leave }
}
