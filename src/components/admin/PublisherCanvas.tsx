'use client'

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { resolveCoverPath } from '@/lib/cover-url'

interface Place { x: number; y: number; w: number }
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

/** The place each element has in the home tile when the owner has not arranged it. */
function defaults(hasCharacter: boolean): Record<Which, Place> {
  return {
    character: { x: 50, y: 48, w: 84 },
    logo: hasCharacter ? { x: 50, y: 88, w: 42 } : { x: 50, y: 50, w: 82 },
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * The tile as a canvas: drag an element to move it, drag its corner to resize it.
 * The toolbar only chooses which element is being edited, and resets it.
 */
export function PublisherCanvas({ row, onClose, onSaved }: { row: CanvasRow; onClose: () => void; onSaved: () => void }) {
  const hasCharacter = !!row.art?.character
  const hasLogo = !!row.art?.logo
  const base = defaults(hasCharacter)
  const [draft, setDraft] = useState<Record<Which, Place>>({
    character: row.art?.layout?.character ?? base.character,
    logo: row.art?.layout?.logo ?? base.logo,
  })
  const [tool, setTool] = useState<Which>(hasCharacter ? 'character' : 'logo')
  const [saving, setSaving] = useState(false)
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<{ which: Which; mode: 'move' | 'scale'; sx: number; sy: number; start: Place } | null>(null)

  const grab = (which: Which, mode: 'move' | 'scale') => (e: ReactPointerEvent<HTMLElement>) => {
    e.stopPropagation()
    e.preventDefault()
    setTool(which)
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { which, mode, sx: e.clientX, sy: e.clientY, start: draft[which] }
  }

  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    const rect = surface.current?.getBoundingClientRect()
    if (!d || !rect) return
    const dx = ((e.clientX - d.sx) / rect.width) * 100
    const dy = ((e.clientY - d.sy) / rect.height) * 100
    const next: Place = d.mode === 'move'
      ? { ...d.start, x: clamp(d.start.x + dx, 0, 100), y: clamp(d.start.y + dy, 0, 100) }
      : { ...d.start, w: clamp(d.start.w + dx, 4, 200) }
    setDraft(prev => ({ ...prev, [d.which]: next }))
  }

  const release = () => { drag.current = null }

  const reset = () => setDraft(prev => ({ ...prev, [tool]: base[tool] }))

  const save = async () => {
    setSaving(true)
    await fetch('/api/admin/publishers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: row.key, layout: draft }),
    })
    setSaving(false)
    onSaved()
  }

  const piece = (which: Which, src: string, plain: boolean) => {
    const p = draft[which]
    const style: CSSProperties = {
      position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, transform: 'translate(-50%, -50%)',
    }
    const selected = tool === which
    return (
      <div key={which} style={style} onPointerDown={grab(which, 'move')} onPointerMove={move} onPointerUp={release}
           className={`cursor-move touch-none ${selected ? 'outline outline-2 outline-white/80 outline-offset-2' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} className={`block h-auto w-full select-none pointer-events-none ${which === 'logo' && !plain ? 'brightness-0 invert' : ''}`} />
        {selected && (
          <span onPointerDown={grab(which, 'scale')} onPointerMove={move} onPointerUp={release} role="presentation"
                className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm border border-black/40 bg-white" />
        )}
      </div>
    )
  }

  const c1 = row.art?.colors?.[0] ?? '#3a3a55'
  const c2 = row.art?.colors?.[1] ?? '#14141f'
  const character = resolveCoverPath(row.art?.character ?? null)
  const logo = resolveCoverPath(row.art?.logo ?? null)

  return (
    <div role="dialog" aria-modal="true" aria-label={`Ajustar ${row.name}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-3xl space-y-4 rounded-2xl border border-border bg-card p-5">
        <header className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Ajustar {row.name}</h2>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-2.5 py-1 text-sm hover:bg-secondary">Cerrar</button>
        </header>

        <div className="flex flex-wrap items-start gap-6">
          <div ref={surface} onPointerMove={move} onPointerUp={release} onPointerLeave={release}
               className="relative aspect-[3/4] w-[300px] select-none touch-none overflow-hidden rounded-xl"
               style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
            {character && hasCharacter && piece('character', character, true)}
            {logo && hasLogo && piece('logo', logo, row.art?.plain === true)}
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
            <button type="button" onClick={reset} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
              Restablecer {tool === 'character' ? 'el personaje' : 'el logo'}
            </button>
            <p className="text-xs text-muted-foreground">
              Arrastra el elemento para moverlo. Arrastra su esquina para cambiarle el tamaño. Así se verá en la portada de Home.
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
