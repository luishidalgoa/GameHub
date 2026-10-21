'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { RGB, ShaderBackground } from '@/lib/shader-bg'

export interface StageArt {
  /** Up to three "#rrggbb" colors; the page tints itself with them. */
  palette?: string[] | null
  /** Image to show, heavily blurred, behind the page. */
  backdrop?: string | null
}

interface StageApi {
  /** Theme the page after a game; `null` returns to the default look. */
  show(art: StageArt | null): void
}

const StageContext = createContext<StageApi>({ show: () => {} })
export const useStage = () => useContext(StageContext)

/** The look before any game is chosen: the brand red over deep indigo and teal. */
const DEFAULT_PALETTE = ['#b3282d', '#2c2a8c', '#0b5560']

function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Keep a color bright and saturated enough to tint a dark page: raw palette
 *  colors from a dark game art would otherwise vanish into the background. */
function lift(rgb: RGB): RGB {
  const max = Math.max(...rgb)
  const k = max < 0.55 ? 0.55 / Math.max(max, 0.05) : 1
  return [Math.min(1, rgb[0] * k), Math.min(1, rgb[1] * k), Math.min(1, rgb[2] * k)]
}

const toHex = (c: RGB) => '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')

/**
 * The home page's stage: a shader background behind everything, the blurred art of
 * the game being looked at over it, and three CSS color variables (--art-a/b/c)
 * that the rest of the page tints itself with. Anything inside can call
 * `useStage().show(...)` when a game takes focus.
 */
export function HomeStage({ children }: { children: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shaderRef = useRef<ShaderBackground | null>(null)
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE)
  const [layers, setLayers] = useState<{ id: number; src: string; shown: boolean }[]>([])
  const nextId = useRef(1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    import('@/lib/shader-bg')
      .then(m => {
        if (cancelled) return
        shaderRef.current = m.mountShaderBackground(canvas, DEFAULT_PALETTE.map(h => lift(hexToRgb(h)!)))
      })
      .catch(() => { /* no WebGL: the CSS gradient below stays */ })
    return () => { cancelled = true; shaderRef.current?.dispose(); shaderRef.current = null }
  }, [])

  const show = useCallback((art: StageArt | null) => {
    const colors = (art?.palette?.length ? art.palette : DEFAULT_PALETTE)
      .map(h => hexToRgb(h)).filter((c): c is RGB => c !== null).map(lift)
    const lifted = colors.length ? colors : DEFAULT_PALETTE.map(h => lift(hexToRgb(h)!))
    setPalette(lifted.map(toHex))
    shaderRef.current?.setPalette(lifted)

    const src = art?.backdrop ?? null
    setLayers(prev => {
      const top = prev[prev.length - 1]
      if ((top?.src ?? null) === src) return prev
      if (!src) return prev.map(l => ({ ...l, shown: false }))
      return [...prev.slice(-1).map(l => ({ ...l, shown: true })), { id: nextId.current++, src, shown: false }]
    })
  }, [])

  // A layer fades in one frame after it mounts; the one it replaced is dropped
  // once the crossfade is over.
  useEffect(() => {
    if (layers.some(l => !l.shown && l === layers[layers.length - 1])) {
      const raf = requestAnimationFrame(() =>
        setLayers(prev => prev.map((l, i) => (i === prev.length - 1 ? { ...l, shown: true } : l))))
      return () => cancelAnimationFrame(raf)
    }
    if (layers.length > 1) {
      const timer = setTimeout(() => setLayers(prev => prev.slice(-1)), 900)
      return () => clearTimeout(timer)
    }
  }, [layers])

  const api = useMemo<StageApi>(() => ({ show }), [show])
  const style = {
    '--art-a': palette[0], '--art-b': palette[1] ?? palette[0], '--art-c': palette[2] ?? palette[1] ?? palette[0],
  } as React.CSSProperties

  return (
    <StageContext.Provider value={api}>
      <div className="home-stage relative" style={style}>
        {/* Fixed layers behind the page. The gradient is what shows without WebGL. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
             style={{ background: 'radial-gradient(120% 90% at 30% 10%, color-mix(in srgb, var(--art-a) 38%, #05050a), #05050a 70%)' }}>
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {layers.map(l => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={l.id} src={l.src} alt="" decoding="async"
                 className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
                 style={{ opacity: l.shown ? 0.34 : 0, filter: 'blur(70px) saturate(1.5)', transform: 'scale(1.25)', mixBlendMode: 'screen' }} />
          ))}
        </div>
        <div className="relative z-10">{children}</div>
      </div>
    </StageContext.Provider>
  )
}
