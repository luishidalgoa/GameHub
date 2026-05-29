'use client'

import { useRef, useState, useEffect } from 'react'
import { X, Check, RotateCcw } from 'lucide-react'

interface Props {
  src: string
  onSave: (blob: Blob) => void
  onClose: () => void
  thumbnailWidth?: number
  thumbnailHeight?: number
}

/** Crop frame stored as viewport fractions. `s` is the size fraction; because
 *  the viewport itself is the platform aspect, a square in fraction space maps
 *  to the platform's width:height on screen. */
interface Frame { x: number; y: number; s: number }
type Mode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

const MIN_S = 0.1

export function CoverAdjustModal({ src, onSave, onClose, thumbnailWidth = 200, thumbnailHeight = 300 }: Props) {
  const aspect = thumbnailWidth / thumbnailHeight        // platform frame aspect (w/h)
  const OUT_W  = Math.min(1200, thumbnailWidth * 6)
  const OUT_H  = Math.round(OUT_W / aspect)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const imgRef     = useRef<HTMLImageElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)

  const [loaded, setLoaded]       = useState(false)
  const [corsError, setCorsError] = useState(false)
  const [nat, setNat]             = useState({ w: 0, h: 0 })   // natural image size
  const [disp, setDisp]           = useState({ w: 0, h: 0 })   // viewport (platform aspect) on screen
  // Default frame = the whole platform frame → the full image is preserved
  // ("contain"); the user can shrink/move it to crop in.
  const [frame, setFrame]         = useState<Frame>({ x: 0, y: 0, s: 1 })

  const drag = useRef<{ mode: Mode; sx: number; sy: number; start: Frame } | null>(null)

  // Viewport size = platform aspect, fit within the modal width and 52vh tall.
  useEffect(() => {
    const compute = () => {
      const maxW = wrapperRef.current?.clientWidth ?? 320
      const maxH = Math.round(window.innerHeight * 0.52)
      let w = maxW, h = maxW / aspect
      if (h > maxH) { h = maxH; w = maxH * aspect }
      setDisp({ w: Math.round(w), h: Math.round(h) })
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    window.addEventListener('resize', compute)
    return () => { ro.disconnect(); window.removeEventListener('resize', compute) }
  }, [aspect])

  const onLoad = () => {
    const img = imgRef.current!
    setNat({ w: img.naturalWidth, h: img.naturalHeight })
    setLoaded(true)
  }

  // ── Pointer interaction (frame is in viewport fractions) ─────────────────────

  const startDrag = (mode: Mode) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: { ...frame } }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const clampMove = (x: number, y: number, s: number): Frame => ({
    s,
    x: Math.max(0, Math.min(1 - s, x)),
    y: Math.max(0, Math.min(1 - s, y)),
  })

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !disp.w) return
    const dfx = (e.clientX - d.sx) / disp.w
    const dfy = (e.clientY - d.sy) / disp.h
    const st  = d.start

    if (d.mode === 'move') {
      setFrame(clampMove(st.x + dfx, st.y + dfy, st.s))
      return
    }

    // Resize from the opposite (anchor) corner; size stays platform-aspect.
    const anchorX = (d.mode === 'nw' || d.mode === 'sw') ? st.x + st.s : st.x
    const anchorY = (d.mode === 'nw' || d.mode === 'ne') ? st.y + st.s : st.y
    const dirX    = (d.mode === 'se' || d.mode === 'ne') ? 1 : -1
    const dirY    = (d.mode === 'se' || d.mode === 'sw') ? 1 : -1

    // Drive size by whichever axis the pointer moved more.
    const delta = Math.abs(dfx) > Math.abs(dfy) ? dfx * dirX : dfy * dirY
    const maxSx = dirX > 0 ? 1 - anchorX : anchorX
    const maxSy = dirY > 0 ? 1 - anchorY : anchorY
    const s = Math.max(MIN_S, Math.min(st.s + delta, maxSx, maxSy))

    setFrame({
      s,
      x: dirX > 0 ? anchorX : anchorX - s,
      y: dirY > 0 ? anchorY : anchorY - s,
    })
  }

  const onPointerUp = () => { drag.current = null }

  const reset = () => setFrame({ x: 0, y: 0, s: 1 })

  const apply = () => {
    const img = imgRef.current!, canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    canvas.width = OUT_W; canvas.height = OUT_H
    try {
      // Image's "contain" rectangle inside the viewport, as viewport fractions.
      const imgScale = Math.min(disp.w / nat.w, disp.h / nat.h)
      const idw = nat.w * imgScale, idh = nat.h * imgScale
      const ifx = ((disp.w - idw) / 2) / disp.w
      const ify = ((disp.h - idh) / 2) / disp.h
      const ifw = idw / disp.w
      const ifh = idh / disp.h

      // Map the full image into the output frame (black bars where the frame
      // extends past the image).
      const dx = ((ifx - frame.x) / frame.s) * OUT_W
      const dy = ((ify - frame.y) / frame.s) * OUT_H
      const dw = (ifw / frame.s) * OUT_W
      const dh = (ifh / frame.s) * OUT_H

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, OUT_W, OUT_H)
      ctx.drawImage(img, 0, 0, nat.w, nat.h, dx, dy, dw, dh)
      canvas.toBlob(b => { if (b) onSave(b) }, 'image/webp', 0.92)
    } catch { setCorsError(true) }
  }

  // Frame in screen px.
  const r = { x: frame.x * disp.w, y: frame.y * disp.h, w: frame.s * disp.w, h: frame.s * disp.h }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 bg-card border border-border rounded-xl shadow-2xl flex flex-col w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Adjust Cover</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Crop area */}
        <div className="px-4 pt-4">
          <p className="text-xs text-muted-foreground text-center mb-3">
            Por defecto se conserva la carátula completa · arrastra/encoge el recuadro para recortar
          </p>

          <div ref={wrapperRef} className="flex justify-center">
            <div
              className="relative overflow-hidden rounded-lg bg-black select-none touch-none"
              style={{ width: disp.w || '100%', height: disp.h || 240 }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* Image shown "contain" — the whole cover is visible, bars fill the rest */}
              <img
                ref={imgRef}
                src={src}
                alt=""
                crossOrigin="anonymous"
                onLoad={onLoad}
                onError={() => setCorsError(true)}
                draggable={false}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{ display: loaded ? 'block' : 'none' }}
              />

              {!loaded && !corsError && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
              )}

              {corsError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-sm text-destructive text-center px-4 gap-2">
                  <span>Cannot adjust this image</span>
                  <span className="text-xs text-muted-foreground">(blocked by CORS policy)</span>
                </div>
              )}

              {/* Crop frame */}
              {loaded && !corsError && disp.w > 0 && (
                <div
                  className="absolute border-2 border-white/90 cursor-move"
                  style={{ left: r.x, top: r.y, width: r.w, height: r.h, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
                  onPointerDown={startDrag('move')}
                >
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/3 inset-x-0 border-t border-white/30" />
                    <div className="absolute top-2/3 inset-x-0 border-t border-white/30" />
                    <div className="absolute inset-y-0 left-1/3 border-l border-white/30" />
                    <div className="absolute inset-y-0 left-2/3 border-l border-white/30" />
                  </div>
                  {(['nw', 'ne', 'sw', 'se'] as Mode[]).map(c => (
                    <div
                      key={c}
                      onPointerDown={startDrag(c)}
                      className="absolute w-4 h-4 bg-white rounded-sm border border-black/40 shadow"
                      style={{
                        left:   c.includes('w') ? -9 : undefined,
                        right:  c.includes('e') ? -9 : undefined,
                        top:    c.includes('n') ? -9 : undefined,
                        bottom: c.includes('s') ? -9 : undefined,
                        cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 py-4">
          <button
            type="button" onClick={reset} disabled={!loaded || corsError}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-secondary border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            type="button" onClick={apply} disabled={!loaded || corsError}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            <Check className="w-4 h-4" />
            Apply
          </button>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  )
}
