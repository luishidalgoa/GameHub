'use client'

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { resolveCoverPath } from '@/lib/cover-url'

interface Place { x: number; y: number; w?: number; h?: number }
type Which = 'character' | 'logo'

export interface CanvasRow {
  key: string
  name: string
  art: {
    logo: string | null
    plain?: boolean
    character: string | null
    colors: string[]
    layout?: { character?: Place; logo?: Place }
  } | null
}

/** The width of a publisher card on Home at the widest breakpoint: the canvas is drawn at this size, 1x. */
const CARD_WIDTH = 216

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** A placed element on the canvas: its centre, and its box, in percent of the tile. */
function boxStyle(p: Place): CSSProperties {
  return {
    position: 'absolute',
    left: `${p.x}%`,
    top: `${p.y}%`,
    width: p.w !== undefined ? `${p.w}%` : 'auto',
    height: p.h !== undefined ? `${p.h}%` : 'auto',
    transform: 'translate(-50%, -50%)',
    maxWidth: 'none',
  }
}

/** The picture inside a placed box, the way Home draws a placed element. */
function pictureStyle(p: Place, crop: boolean): CSSProperties {
  const fit = crop ? { objectFit: 'cover' as const, objectPosition: 'top' } : { objectFit: 'contain' as const, objectPosition: 'center' }
  if (p.w !== undefined && p.h !== undefined) return { width: '100%', height: '100%', ...fit }
  if (p.w !== undefined) return { width: '100%', height: 'auto' }
  return { width: 'auto', height: '100%' }
}

/**
 * The tile as a canvas, at the size it has on Home. An element the owner has not touched is drawn
 * with the same classes Home uses, so it looks the same here and there. Touching it turns it into
 * a box that is measured from what is on screen, then moves and resizes like any other. Drag the
 * element to move it; drag its corner to resize it. The toolbar only chooses the element, resets
 * it, and sets the zoom.
 */
export function PublisherCanvas({ row, onClose, onSaved }: { row: CanvasRow; onClose: () => void; onSaved: () => void }) {
  const hasCharacter = !!row.art?.character
  const hasLogo = !!row.art?.logo
  // undefined: the element is still Home's default; a Place once the owner has touched it.
  const [draft, setDraft] = useState<Partial<Record<Which, Place>>>({
    character: row.art?.layout?.character,
    logo: row.art?.layout?.logo,
  })
  const [tool, setTool] = useState<Which>(hasCharacter ? 'character' : 'logo')
  const [zoom, setZoom] = useState<1 | 2>(1)
  const [saving, setSaving] = useState(false)
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<{ which: Which; mode: 'move' | 'scale'; sx: number; sy: number; start: Place } | null>(null)

  /** The box an element occupies now, in percent of the canvas, measured from the screen. */
  const measure = (el: HTMLElement): Place | null => {
    const s = surface.current?.getBoundingClientRect()
    if (!s) return null
    const r = el.getBoundingClientRect()
    return {
      x: clamp(((r.left + r.width / 2 - s.left) / s.width) * 100, 0, 100),
      y: clamp(((r.top + r.height / 2 - s.top) / s.height) * 100, 0, 100),
      w: clamp((r.width / s.width) * 100, 4, 200),
      h: clamp((r.height / s.height) * 100, 4, 200),
    }
  }

  const grab = (which: Which, mode: 'move' | 'scale') => (e: ReactPointerEvent<HTMLElement>) => {
    e.stopPropagation()
    e.preventDefault()
    setTool(which)
    let start = draft[which]
    if (!start) {
      // First touch of a default element: it becomes the box it occupies on screen.
      const measured = measure(e.currentTarget)
      if (!measured) return
      start = measured
      setDraft(prev => ({ ...prev, [which]: measured }))
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { which, mode, sx: e.clientX, sy: e.clientY, start }
  }

  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    const rect = surface.current?.getBoundingClientRect()
    if (!d || !rect) return
    const dx = ((e.clientX - d.sx) / rect.width) * 100
    const dy = ((e.clientY - d.sy) / rect.height) * 100
    const s = d.start
    let next: Place
    if (d.mode === 'move') {
      next = { ...s, x: clamp(s.x + dx, 0, 100), y: clamp(s.y + dy, 0, 100) }
    } else if (s.w !== undefined && s.h !== undefined) {
      // A box keeps its proportions when its corner moves.
      const w = clamp(s.w + dx, 4, 200)
      next = { ...s, w, h: clamp(s.h * (w / s.w), 4, 200) }
    } else if (s.w !== undefined) {
      next = { ...s, w: clamp(s.w + dx, 4, 200) }
    } else {
      next = { ...s, h: clamp((s.h ?? 10) + dy, 4, 200) }
    }
    setDraft(prev => ({ ...prev, [d.which]: next }))
  }

  const release = () => { drag.current = null }

  /** Back to Home's default for the element being edited. */
  const reset = () => setDraft(prev => ({ ...prev, [tool]: undefined }))

  const save = async () => {
    setSaving(true)
    await fetch('/api/admin/publishers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: row.key, layout: draft }),
    })
    setSaving(false)
    onSaved()
  }

  const character = resolveCoverPath(row.art?.character ?? null)
  const logo = resolveCoverPath(row.art?.logo ?? null)
  const plain = row.art?.plain === true

  /** The character: Home's default cut, or a placed box. */
  const renderCharacter = () => {
    if (!character) return null
    const p = draft.character
    if (!p) {
      // Same classes as Home's default character.
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={character} alt="" draggable={false} onPointerDown={grab('character', 'move')} onPointerMove={move} onPointerUp={release}
             className={`absolute inset-x-[8%] top-[9%] bottom-[25%] h-auto w-[84%] max-w-none cursor-move touch-none select-none object-cover object-top drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)] ${tool === 'character' ? 'outline outline-2 outline-white/80 outline-offset-2' : ''}`} />
      )
    }
    return (
      <div key="character" style={boxStyle(p)} onPointerDown={grab('character', 'move')} onPointerMove={move} onPointerUp={release}
           className={`cursor-move touch-none ${tool === 'character' ? 'outline outline-2 outline-white/80 outline-offset-2' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={character} alt="" draggable={false} className="block select-none pointer-events-none drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)]" style={pictureStyle(p, true)} />
        {tool === 'character' && (
          <span onPointerDown={grab('character', 'scale')} onPointerMove={move} onPointerUp={release} role="presentation"
                className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm border border-black/40 bg-white" />
        )}
      </div>
    )
  }

  /** The logo: Home's default line (under a character) or the big centred one, or a placed box. */
  const renderLogo = () => {
    if (!logo) return null
    const p = draft.logo
    const tone = plain ? '' : 'brightness-0 invert'
    if (!p) {
      if (hasCharacter) {
        // Same classes as Home's default logo under a character.
        return (
          <div className="absolute inset-x-0 bottom-4 flex flex-col items-center px-5 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" draggable={false} onPointerDown={grab('logo', 'move')} onPointerMove={move} onPointerUp={release}
                 className={`block max-w-[82%] w-auto max-h-8 cursor-move touch-none select-none object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] ${tone} ${tool === 'logo' ? 'outline outline-2 outline-white/80 outline-offset-2' : ''}`} />
          </div>
        )
      }
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" draggable={false} onPointerDown={grab('logo', 'move')} onPointerMove={move} onPointerUp={release}
               className={`block max-w-[82%] max-h-28 w-[82%] cursor-move touch-none select-none object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] ${tone} ${tool === 'logo' ? 'outline outline-2 outline-white/80 outline-offset-2' : ''}`} />
        </div>
      )
    }
    return (
      <div key="logo" style={boxStyle(p)} onPointerDown={grab('logo', 'move')} onPointerMove={move} onPointerUp={release}
           className={`cursor-move touch-none ${tool === 'logo' ? 'outline outline-2 outline-white/80 outline-offset-2' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" draggable={false} className={`block select-none pointer-events-none ${tone}`} style={pictureStyle(p, false)} />
        {tool === 'logo' && (
          <span onPointerDown={grab('logo', 'scale')} onPointerMove={move} onPointerUp={release} role="presentation"
                className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm border border-black/40 bg-white" />
        )}
      </div>
    )
  }

  const c1 = row.art?.colors?.[0] ?? '#3a3a55'
  const c2 = row.art?.colors?.[1] ?? '#14141f'
  const width = CARD_WIDTH * zoom

  return (
    <div role="dialog" aria-modal="true" aria-label={`Ajustar ${row.name}`} className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/70 p-4">
      <div className="w-full max-w-4xl space-y-4 rounded-2xl border border-border bg-card p-5">
        <header className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Ajustar {row.name}</h2>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-2.5 py-1 text-sm hover:bg-secondary">Cerrar</button>
        </header>

        <div className="flex flex-wrap items-start gap-6">
          <div className="space-y-2">
            <div ref={surface} onPointerMove={move} onPointerUp={release} onPointerLeave={release}
                 className="relative aspect-[3/4] select-none touch-none overflow-hidden rounded-xl"
                 style={{ width, background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
              {hasCharacter && renderCharacter()}
              {hasLogo && renderLogo()}
            </div>
            <p className="text-xs text-muted-foreground">Tamaño de la tarjeta en Home: {CARD_WIDTH} × {Math.round(CARD_WIDTH * 4 / 3)} px.</p>
          </div>

          <aside className="min-w-[200px] flex-1 space-y-4 text-sm">
            <div role="radiogroup" aria-label="Elemento" className="flex gap-2">
              {hasCharacter && (
                <button type="button" role="radio" aria-checked={tool === 'character'} onClick={() => setTool('character')}
                        className={`rounded-md border px-3 py-1.5 ${tool === 'character' ? 'border-primary bg-primary/15' : 'border-border hover:bg-secondary'}`}>
                  Personaje
                </button>
              )}
              {hasLogo && (
                <button type="button" role="radio" aria-checked={tool === 'logo'} onClick={() => setTool('logo')}
                        className={`rounded-md border px-3 py-1.5 ${tool === 'logo' ? 'border-primary bg-primary/15' : 'border-border hover:bg-secondary'}`}>
                  Logo
                </button>
              )}
            </div>
            <div role="radiogroup" aria-label="Zoom" className="flex gap-2">
              {([1, 2] as const).map(z => (
                <button key={z} type="button" role="radio" aria-checked={zoom === z} onClick={() => setZoom(z)}
                        className={`rounded-md border px-3 py-1.5 ${zoom === z ? 'border-primary bg-primary/15' : 'border-border hover:bg-secondary'}`}>
                  {z === 1 ? 'Tamaño real' : 'Ampliado 2×'}
                </button>
              ))}
            </div>
            <button type="button" onClick={reset} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
              Restablecer {tool === 'character' ? 'el personaje' : 'el logo'}
            </button>
            <p className="text-xs text-muted-foreground">
              Arrastra el elemento para moverlo. Arrastra su esquina para cambiarle el tamaño. Esta vista es el tamaño real de la tarjeta, así que lo que ves aquí es lo que sale en Home.
            </p>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={save} disabled={saving}
                      className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">Cancelar</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
