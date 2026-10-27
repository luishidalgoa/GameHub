'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { X, Lock, Unlock } from 'lucide-react'

// Visual editor for a platform's card proportion. The frame is the card: the grid
// shows the middle of a cover inside it (object-cover), so dragging its edges shows
// exactly which part of a real cover will be seen. Stored as width and height in px.

const MIN = 50
const MAX = 800
const VIEW_MAX_W = 300
const VIEW_MAX_H = 420

const PRESETS: Array<{ label: string; w: number; h: number }> = [
  { label: '2:3', w: 200, h: 300 },
  { label: '3:4', w: 225, h: 300 },
  { label: '1:1', w: 300, h: 300 },
  { label: '4:3', w: 400, h: 300 },
  { label: '16:9', w: 480, h: 270 },
]

type Handle = 'e' | 's' | 'se'

interface Props {
  slug: string
  name: string
  width: number
  height: number
  onApply: (width: number, height: number) => void
}

const clamp = (v: number) => Math.min(MAX, Math.max(MIN, Math.round(v)))

export function PlatformBoxEditor({ slug, name, width, height, onApply }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm hover:bg-accent transition-colors"
      >
        Ajustar medidas visualmente
      </button>
      {open && (
        <EditorModal
          slug={slug}
          name={name}
          initialWidth={width}
          initialHeight={height}
          onClose={() => setOpen(false)}
          onApply={(w, h) => { onApply(w, h); setOpen(false) }}
        />
      )}
    </>
  )
}

interface SampleGame { id: number; title: string; coverPath: string | null }

function EditorModal({ slug, name, initialWidth, initialHeight, onClose, onApply }: {
  slug: string
  name: string
  initialWidth: number
  initialHeight: number
  onClose: () => void
  onApply: (w: number, h: number) => void
}) {
  const [w, setW] = useState(clamp(initialWidth))
  const [h, setH] = useState(clamp(initialHeight))
  const [locked, setLocked] = useState(false)
  const [samples, setSamples] = useState<SampleGame[]>([])
  const [sample, setSample] = useState<SampleGame | null>(null)
  const original = useRef({ w: clamp(initialWidth), h: clamp(initialHeight) })
  const drag = useRef<{ handle: Handle; x: number; y: number; w: number; h: number; frameW: number; frameH: number } | null>(null)

  // Sample covers of this platform, so the frame is judged against real art.
  useEffect(() => {
    let alive = true
    fetch(`/api/games?platform=${encodeURIComponent(slug)}&pageSize=24&sort=title`)
      .then(r => (r.ok ? r.json() : { games: [] }))
      .then((data: { games: SampleGame[] }) => {
        if (!alive) return
        const withCover = data.games.filter(g => g.coverPath)
        setSamples(withCover.slice(0, 8))
        setSample(withCover[0] ?? null)
      })
      .catch(() => { /* no samples: the frame still works */ })
    return () => { alive = false }
  }, [slug])

  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The frame on screen keeps the stored proportion, scaled to fit the viewport.
  const frameW = Math.min(VIEW_MAX_W, VIEW_MAX_H * w / h)
  const frameH = frameW * h / w
  const ratio = w / h

  const startDrag = (handle: Handle) => (e: ReactPointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { handle, x: e.clientX, y: e.clientY, w, h, frameW, frameH }
  }

  const moveDrag = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    // Stored units per on-screen pixel, from where the drag started.
    const kx = d.w / d.frameW
    const ky = d.h / d.frameH
    if (locked) {
      const k = d.handle === 'e' ? 1 + dx / d.frameW
        : d.handle === 's' ? 1 + dy / d.frameH
        : 1 + (dx / d.frameW + dy / d.frameH) / 2
      setW(clamp(d.w * k))
      setH(clamp(d.h * k))
      return
    }
    if (d.handle === 'e' || d.handle === 'se') setW(clamp(d.w + dx * kx))
    if (d.handle === 's' || d.handle === 'se') setH(clamp(d.h + dy * ky))
  }

  const endDrag = () => { drag.current = null }

  const handle = (kind: Handle, classes: string) => (
    <div
      onPointerDown={startDrag(kind)}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`absolute z-10 touch-none rounded-full bg-white shadow ring-1 ring-black/40 ${classes}`}
      style={{ width: 16, height: 16, cursor: kind === 'e' ? 'ew-resize' : kind === 's' ? 'ns-resize' : 'nwse-resize' }}
      aria-label={kind === 'e' ? 'Ancho' : kind === 's' ? 'Alto' : 'Ancho y alto'}
    />
  )

  const modal = (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-xl border border-border bg-card p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold">Medidas de carátula · {name}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Arrastra los tiradores para cambiar el ancho, el alto o los dos. La tarjeta muestra el centro de la imagen dentro del marco.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-[1fr_auto]">
          {/* Viewport: the sample cover inside the frame, cropped like a card. */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative" style={{ width: frameW, height: frameH }}>
              <div className="absolute inset-0 overflow-hidden rounded-md border-2 border-primary bg-secondary">
                {sample?.coverPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sample.coverPath} alt="" className="w-full h-full object-cover pointer-events-none select-none" draggable={false} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Sin portada de ejemplo</div>
                )}
                {/* Rule-of-thirds guides */}
                <div className="absolute inset-0 pointer-events-none opacity-40"
                  style={{ backgroundImage: 'linear-gradient(to right, transparent 33%, rgba(255,255,255,.6) 33%, rgba(255,255,255,.6) 33.4%, transparent 33.4%, transparent 66.6%, rgba(255,255,255,.6) 66.6%, rgba(255,255,255,.6) 67%, transparent 67%), linear-gradient(to bottom, transparent 33%, rgba(255,255,255,.6) 33%, rgba(255,255,255,.6) 33.4%, transparent 33.4%, transparent 66.6%, rgba(255,255,255,.6) 66.6%, rgba(255,255,255,.6) 67%, transparent 67%)' }} />
              </div>
              {handle('e', 'top-1/2 -right-2 -translate-y-1/2')}
              {handle('s', 'left-1/2 -bottom-2 -translate-x-1/2')}
              {handle('se', '-right-2 -bottom-2')}
            </div>
            <div className="text-xs text-muted-foreground">
              Proporción {ratio.toFixed(2)} · original {(original.current.w / original.current.h).toFixed(2)}
            </div>
            {samples.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {samples.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSample(s)}
                    className={`h-14 w-10 overflow-hidden rounded border ${sample?.id === s.id ? 'border-primary' : 'border-border'}`}
                    title={s.title}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.coverPath ?? ''} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Exact measures and presets */}
          <div className="space-y-3 md:w-56">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-muted-foreground">
                Ancho (px)
                <input type="number" min={MIN} max={MAX} value={w}
                  onChange={e => setW(clamp(Number(e.target.value) || MIN))}
                  className="w-full rounded-md border border-border bg-secondary px-2 py-1.5 text-sm text-foreground" />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                Alto (px)
                <input type="number" min={MIN} max={MAX} value={h}
                  onChange={e => setH(clamp(Number(e.target.value) || MIN))}
                  className="w-full rounded-md border border-border bg-secondary px-2 py-1.5 text-sm text-foreground" />
              </label>
            </div>

            <button type="button" onClick={() => setLocked(v => !v)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm">
              {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              {locked ? 'Proporción bloqueada' : 'Proporción libre'}
            </button>

            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Proporciones</div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(p => (
                  <button key={p.label} type="button" onClick={() => { setW(p.w); setH(p.h) }}
                    className="rounded border border-border bg-secondary px-2 py-1 text-xs hover:bg-accent">
                    {p.label}
                  </button>
                ))}
                <button type="button" onClick={() => { setW(original.current.w); setH(original.current.h) }}
                  className="rounded border border-border bg-secondary px-2 py-1 text-xs hover:bg-accent">
                  Original
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">
            Cancelar
          </button>
          <button type="button" onClick={() => onApply(w, h)}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90">
            Aplicar a {name}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
