'use client'

import { useRef, useState, useCallback } from 'react'
import { X, ZoomIn, ZoomOut, Check, RotateCcw, MoveHorizontal, MoveVertical } from 'lucide-react'

interface Props {
  src: string
  onSave: (blob: Blob) => void
  onClose: () => void
  thumbnailWidth?: number
  thumbnailHeight?: number
}

export function CoverAdjustModal({ src, onSave, onClose, thumbnailWidth = 200, thumbnailHeight = 300 }: Props) {
  // Calculate output dimensions maintaining aspect ratio based on thumbnail config
  // Use a reasonable maximum while maintaining the aspect ratio
  const aspectRatio = thumbnailWidth / thumbnailHeight
  const OUT_W = Math.min(1200, thumbnailWidth * 6) // Scale up but keep reasonable
  const OUT_H = Math.round(OUT_W / aspectRatio)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef       = useRef<HTMLImageElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)

  const [loaded, setLoaded]       = useState(false)
  const [corsError, setCorsError] = useState(false)
  const [naturalW, setNaturalW]   = useState(0)
  const [naturalH, setNaturalH]   = useState(0)
  const [zoom, setZoom]           = useState(1)
  const [minZoom, setMinZoom]     = useState(1)
  const [coverZoom, setCoverZoom] = useState(1)
  const [pan, setPan]             = useState({ x: 0, y: 0 })

  const dragging   = useRef(false)
  const dragOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  // ── Max pan computed from current zoom (no clamping — free pan) ────────────

  const getMaxPan = useCallback((z: number) => {
    const img  = imgRef.current
    const cont = containerRef.current
    if (!img || !cont) return { maxX: 0, maxY: 0 }
    return {
      maxX: Math.max(0, (naturalW * z - cont.clientWidth)  / 2),
      maxY: Math.max(0, (naturalH * z - cont.clientHeight) / 2),
    }
  }, [naturalW, naturalH])

  const clamp = useCallback((px: number, py: number, z: number) => {
    const { maxX, maxY } = getMaxPan(z)
    return {
      x: Math.max(-maxX, Math.min(maxX, px)),
      y: Math.max(-maxY, Math.min(maxY, py)),
    }
  }, [getMaxPan])

  const applyZoom = useCallback((newZ: number) => {
    const z = Math.max(minZoom, Math.min(10, newZ))
    setPan(p => clamp(p.x, p.y, z))
    setZoom(z)
  }, [minZoom, clamp])

  // ── Image load ─────────────────────────────────────────────────────────────

  const onLoad = () => {
    const img  = imgRef.current!
    const cont = containerRef.current!
    const fitZ = Math.min(
      cont.clientWidth  / img.naturalWidth,
      cont.clientHeight / img.naturalHeight,
    )
    const covZ = Math.max(
      cont.clientWidth  / img.naturalWidth,
      cont.clientHeight / img.naturalHeight,
    )
    setNaturalW(img.naturalWidth)
    setNaturalH(img.naturalHeight)
    setMinZoom(fitZ)
    setCoverZoom(covZ)
    setZoom(covZ)
    setPan({ x: 0, y: 0 })
    setLoaded(true)
  }

  // ── Pointer drag ───────────────────────────────────────────────────────────

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const { mx, my, px, py } = dragOrigin.current
    setPan(clamp(px + (e.clientX - mx), py + (e.clientY - my), zoom))
  }

  const onPointerUp = () => { dragging.current = false }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    applyZoom(zoom * (e.deltaY < 0 ? 1.07 : 0.93))
  }

  // ── Reset / Apply ──────────────────────────────────────────────────────────

  const reset = () => {
    setZoom(coverZoom)
    setPan({ x: 0, y: 0 })
  }

  const apply = () => {
    const img    = imgRef.current!
    const cont   = containerRef.current!
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!

    const cW = cont.clientWidth
    const cH = cont.clientHeight

    const srcX = naturalW / 2 - cW / (2 * zoom) - pan.x / zoom
    const srcY = naturalH / 2 - cH / (2 * zoom) - pan.y / zoom
    const srcW = cW / zoom
    const srcH = cH / zoom

    canvas.width  = OUT_W
    canvas.height = OUT_H

    try {
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUT_W, OUT_H)
      canvas.toBlob(blob => { if (blob) onSave(blob) }, 'image/webp', 0.92)
    } catch {
      setCorsError(true)
    }
  }

  // ── Derived pan limits for sliders ─────────────────────────────────────────

  const { maxX, maxY } = getMaxPan(zoom)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 bg-card border border-border rounded-xl shadow-2xl flex flex-col w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Adjust Cover</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Canvas preview */}
        <div className="px-4 pt-4">
          <p className="text-xs text-muted-foreground text-center mb-2">
            Drag to reposition · scroll or sliders to zoom
          </p>

          <div
            ref={containerRef}
            style={{ aspectRatio: `${thumbnailWidth}/${thumbnailHeight}` }}
            className="relative w-full overflow-hidden rounded-lg bg-black cursor-grab active:cursor-grabbing select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            <img
              ref={imgRef}
              src={src}
              alt=""
              crossOrigin="anonymous"
              onLoad={onLoad}
              onError={() => setCorsError(true)}
              draggable={false}
              className="absolute top-1/2 left-1/2 pointer-events-none"
              style={{
                width:           naturalW || 'auto',
                height:          naturalH || 'auto',
                transform:       `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
                transformOrigin: 'center',
                display:         loaded ? 'block' : 'none',
              }}
            />

            {!loaded && !corsError && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            )}

            {corsError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-sm text-destructive text-center px-4 gap-2">
                <span>Cannot adjust this image</span>
                <span className="text-xs text-muted-foreground">(blocked by CORS policy)</span>
                <span className="text-xs text-muted-foreground">Upload a local file copy to use this tool.</span>
              </div>
            )}

            {loaded && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/3 inset-x-0 border-t border-white/10" />
                <div className="absolute top-2/3 inset-x-0 border-t border-white/10" />
                <div className="absolute inset-y-0 left-1/3 border-l border-white/10" />
                <div className="absolute inset-y-0 left-2/3 border-l border-white/10" />
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        {loaded && !corsError && (
          <div className="px-4 pt-3 pb-1 space-y-2">
            {zoom < coverZoom && (
              <p className="text-xs text-amber-500/80 text-center">
                Zoom out — black bars will appear in output. Zoom in to fill the frame.
              </p>
            )}

            {/* Zoom */}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => applyZoom(zoom * 0.93)}
                className="text-muted-foreground hover:text-foreground p-1 transition-colors flex-shrink-0">
                <ZoomOut className="w-4 h-4" />
              </button>
              <input
                type="range" className="flex-1 accent-primary h-1"
                min={minZoom} max={coverZoom * 8} step={0.001}
                value={zoom}
                onChange={e => applyZoom(parseFloat(e.target.value))}
              />
              <button type="button" onClick={() => applyZoom(zoom * 1.07)}
                className="text-muted-foreground hover:text-foreground p-1 transition-colors flex-shrink-0">
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            {/* X axis */}
            <div className="flex items-center gap-2">
              <MoveHorizontal className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                type="range" className="flex-1 accent-primary h-1"
                min={-Math.max(maxX, 1)} max={Math.max(maxX, 1)} step={0.5}
                value={pan.x}
                disabled={maxX === 0}
                onChange={e => setPan(p => clamp(parseFloat(e.target.value), p.y, zoom))}
              />
            </div>

            {/* Y axis */}
            <div className="flex items-center gap-2">
              <MoveVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                type="range" className="flex-1 accent-primary h-1"
                min={-Math.max(maxY, 1)} max={Math.max(maxY, 1)} step={0.5}
                value={pan.y}
                disabled={maxY === 0}
                onChange={e => setPan(p => clamp(p.x, parseFloat(e.target.value), zoom))}
              />
            </div>

          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 px-4 py-4">
          <button
            type="button" onClick={reset}
            disabled={!loaded || corsError}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-secondary border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            type="button" onClick={apply}
            disabled={!loaded || corsError}
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
