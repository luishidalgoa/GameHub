'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { X, Check, RotateCcw } from 'lucide-react'

interface Props {
  src: string
  onSave: (blob: Blob) => void
  onClose: () => void
  thumbnailWidth?: number
  thumbnailHeight?: number
}

/** Crop rectangle in the image's natural pixel coordinates. */
interface Rect { x: number; y: number; w: number; h: number }
type Mode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

export function CoverAdjustModal({ src, onSave, onClose, thumbnailWidth = 200, thumbnailHeight = 300 }: Props) {
  const aspect = thumbnailWidth / thumbnailHeight        // target cover aspect (w/h)
  const OUT_W  = Math.min(1200, thumbnailWidth * 6)
  const OUT_H  = Math.round(OUT_W / aspect)

  const wrapperRef   = useRef<HTMLDivElement>(null)
  const imgRef       = useRef<HTMLImageElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)

  const [loaded, setLoaded]       = useState(false)
  const [corsError, setCorsError] = useState(false)
  const [nat, setNat]             = useState({ w: 0, h: 0 })   // natural image size
  const [disp, setDisp]           = useState({ w: 0, h: 0 })   // on-screen image size
  const [crop, setCrop]           = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 })

  const drag = useRef<{ mode: Mode; sx: number; sy: number; start: Rect } | null>(null)

  // Largest aspect-correct rectangle, centered in the image.
  const maxCrop = useCallback((nw: number, nh: number): Rect => {
    let w = nw, h = nw / aspect
    if (h > nh) { h = nh; w = nh * aspect }
    return { x: (nw - w) / 2, y: (nh - h) / 2, w, h }
  }, [aspect])

  const onLoad = () => {
    const img = imgRef.current!
    setNat({ w: img.naturalWidth, h: img.naturalHeight })
    setCrop(maxCrop(img.naturalWidth, img.naturalHeight))
    setLoaded(true)
  }

  // Fit the image inside the modal (width-bound + 52vh height cap), preserving aspect.
  useEffect(() => {
    if (!loaded || !nat.w || !nat.h) return
    const compute = () => {
      const maxW = wrapperRef.current?.clientWidth ?? 320
      const maxH = Math.round(window.innerHeight * 0.52)
      const r    = nat.w / nat.h
      let w = maxW, h = maxW / r
      if (h > maxH) { h = maxH; w = maxH * r }
      setDisp({ w: Math.round(w), h: Math.round(h) })
    }
    compute()
    const ro = new ResizeObserver(compute)
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    window.addEventListener('resize', compute)
    return () => { ro.disconnect(); window.removeEventListener('resize', compute) }
  }, [loaded, nat.w, nat.h])

  const scale = disp.w && nat.w ? disp.w / nat.w : 1   // natural px * scale = screen px
  const minW  = Math.max(20, Math.max(nat.w, nat.h) * 0.08)

  // ── Pointer interaction ─────────────────────────────────────────────────────

  const startDrag = (mode: Mode) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: { ...crop } }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !scale) return
    const dxN = (e.clientX - d.sx) / scale
    const dyN = (e.clientY - d.sy) / scale
    const s   = d.start

    if (d.mode === 'move') {
      setCrop({
        ...s,
        x: Math.max(0, Math.min(nat.w - s.w, s.x + dxN)),
        y: Math.max(0, Math.min(nat.h - s.h, s.y + dyN)),
      })
      return
    }

    // Resize from the opposite (anchor) corner, keeping the target aspect.
    const anchorX = (d.mode === 'nw' || d.mode === 'sw') ? s.x + s.w : s.x
    const anchorY = (d.mode === 'nw' || d.mode === 'ne') ? s.y + s.h : s.y
    const dirX    = (d.mode === 'se' || d.mode === 'ne') ? 1 : -1
    const dirY    = (d.mode === 'se' || d.mode === 'sw') ? 1 : -1
    const mouseX  = ((d.mode === 'se' || d.mode === 'ne') ? s.x + s.w : s.x) + dxN
    // (mouseY not needed — height is derived from width to keep aspect)

    let w = Math.max(minW, (mouseX - anchorX) * dirX)
    w = Math.min(w, dirX > 0 ? nat.w - anchorX : anchorX)
    let h = w / aspect
    const maxHy = dirY > 0 ? nat.h - anchorY : anchorY
    if (h > maxHy) { h = maxHy; w = h * aspect }

    setCrop({
      x: dirX > 0 ? anchorX : anchorX - w,
      y: dirY > 0 ? anchorY : anchorY - h,
      w, h,
    })
  }

  const onPointerUp = () => { drag.current = null }

  const reset = () => setCrop(maxCrop(nat.w, nat.h))

  const apply = () => {
    const img = imgRef.current!, canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    canvas.width = OUT_W; canvas.height = OUT_H
    try {
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, OUT_W, OUT_H)
      canvas.toBlob(b => { if (b) onSave(b) }, 'image/webp', 0.92)
    } catch { setCorsError(true) }
  }

  // Crop rectangle in screen pixels.
  const r = { x: crop.x * scale, y: crop.y * scale, w: crop.w * scale, h: crop.h * scale }

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
            Arrastra el recuadro para mover · tira de las esquinas para ajustar
          </p>

          <div ref={wrapperRef} className="flex justify-center">
            <div
              className="relative overflow-hidden rounded-lg bg-black select-none touch-none"
              style={{
                width:  loaded && disp.w ? disp.w : '100%',
                height: loaded && disp.h ? disp.h : 240,
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <img
                ref={imgRef}
                src={src}
                alt=""
                crossOrigin="anonymous"
                onLoad={onLoad}
                onError={() => setCorsError(true)}
                draggable={false}
                className="absolute inset-0 w-full h-full object-fill pointer-events-none"
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

              {/* Crop box */}
              {loaded && !corsError && disp.w > 0 && (
                <div
                  className="absolute border-2 border-white/90 cursor-move"
                  style={{ left: r.x, top: r.y, width: r.w, height: r.h, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
                  onPointerDown={startDrag('move')}
                >
                  {/* rule-of-thirds guides */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/3 inset-x-0 border-t border-white/30" />
                    <div className="absolute top-2/3 inset-x-0 border-t border-white/30" />
                    <div className="absolute inset-y-0 left-1/3 border-l border-white/30" />
                    <div className="absolute inset-y-0 left-2/3 border-l border-white/30" />
                  </div>
                  {/* corner handles */}
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
