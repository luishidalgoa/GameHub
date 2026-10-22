'use client'

import { useEffect, useRef } from 'react'
import { hexToRgb, lift, type RGB } from '@/lib/palette-color'

/** The brand colours, used when a game has no palette of its own (same as home). */
const DEFAULT_PALETTE = ['#b3282d', '#2c2a8c', '#0b5560']

/**
 * The page's procedural background: the home page's shader, tinted by the
 * game's own palette. Without WebGL the element stays empty and the page colour shows.
 */
export function ProceduralFill({ palette }: { palette: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const key = palette.join(',')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let shader: { dispose(): void } | null = null
    const colors: RGB[] = (palette.length ? palette : DEFAULT_PALETTE)
      .map(hexToRgb)
      .filter((c): c is RGB => c !== null)
      .map(lift)
    import('@/lib/shader-bg')
      .then(m => {
        if (cancelled || colors.length === 0) return
        shader = m.mountShaderBackground(canvas, colors)
      })
      .catch(() => { /* no WebGL: the page colour stays */ })
    return () => { cancelled = true; shader?.dispose() }
    // `key` stands for `palette`: a new palette remounts the shader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
}
