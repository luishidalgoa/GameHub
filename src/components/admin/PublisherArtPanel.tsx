'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { resolveCoverPath } from '@/lib/cover-url'
import { publisherKey } from '@/lib/publishers'
import { BACKDROP_LABEL, BACKDROP_STYLES, DEFAULT_TEMPLATE, TEMPLATE_LABEL, TILE_TEMPLATES, type BackdropStyle, type TileTemplate } from '@/lib/publisher-style'
import { PublisherTileFace, type TileElement } from '@/components/home/PublisherTileFace'
import type { PublisherTileData } from '@/lib/home-data'
import type { Place, PublisherLayout } from '@/lib/publisher-art'

interface Row {
  key: string
  name: string
  games: number
  /** The tile as the home draws it. */
  tile: PublisherTileData
  art: { logo: string | null; plain?: boolean; character: string | null; colors: string[]; checkedAt: string | null; layout?: { character?: { x: number; y: number; w: number }; logo?: { x: number; y: number; w: number } }; style?: { template?: TileTemplate; backdrop?: BackdropStyle | 'auto' } } | null
}

const btn = 'rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

/**
 * El arte de las editoras de la portada. Cada fila muestra la tesela y su estado; «Editar»
 * abre el diálogo con todo lo demás. Recolocar el logo o el personaje se hace en el lienzo.
 */
export function PublisherArtPanel() {
  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<Row | null>(null)
  const many = useRef<HTMLInputElement>(null)
  const pick = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const target = useRef<{ key: string; kind: 'character' | 'logo' }>({ key: '', kind: 'character' })

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/publishers')
    if (!res.ok) return
    const data = await res.json()
    setRows(data.publishers)
    setRunning(data.running)
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, running ? 3000 : 20000)
    return () => clearInterval(timer)
  }, [load, running])

  const findLogos = async (force: boolean) => {
    await fetch('/api/admin/publishers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
    })
    setRunning(true)
  }

  // Un solo cambio guardado: el resto de la tesela queda como estaba.
  const saveStyleFor = async (key: string, change: { template?: TileTemplate; backdrop?: BackdropStyle | 'auto' }) => {
    const current = rows.find(r => r.key === key)?.art?.style ?? {}
    setBusy(key)
    await fetch('/api/admin/publishers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, style: { ...current, ...change } }),
    })
    setBusy(null)
    load()
  }

  // Where the logo and the character sit in the tile, as arranged in the preview. Saved quietly:
  // the dialog keeps its own copy while it is open, so nothing is reloaded or disabled.
  const saveLayoutFor = (key: string, layout: PublisherLayout) =>
    fetch('/api/admin/publishers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, layout }),
    })

  const savePlainFor = async (key: string, plain: boolean) => {
    setBusy(key)
    await fetch('/api/admin/publishers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, plain }),
    })
    setBusy(null)
    load()
  }

  const uploadTo = async (key: string, kind: 'character' | 'logo', file: File) => {
    setBusy(key)
    const form = new FormData()
    form.set('key', key)
    form.set('kind', kind)
    form.set('file', file)
    await fetch('/api/admin/publishers', { method: 'PUT', body: form })
    setBusy(null)
    load()
  }

  const upload = (file: File) => uploadTo(target.current.key, target.current.kind, file)

  // Varios personajes a la vez: cada archivo se llama como su editora («nintendo.png»).
  const uploadMany = async (files: FileList) => {
    const unmatched: string[] = []
    for (const file of Array.from(files)) {
      const key = publisherKey(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '))
      const row = rows.find(r => r.key === key)
      if (!row) { unmatched.push(file.name); continue }
      setBusy(row.key)
      const form = new FormData()
      form.set('key', row.key); form.set('kind', 'character'); form.set('file', file)
      await fetch('/api/admin/publishers', { method: 'PUT', body: form })
    }
    setBusy(null)
    setNote(unmatched.length ? `Sin editora que coincida: ${unmatched.join(', ')}` : '')
    load()
  }

  const remove = async (key: string) => {
    setBusy(key)
    await fetch('/api/admin/publishers', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }),
    })
    setBusy(null)
    load()
  }

  // El botón que abrió el diálogo recupera el foco al cerrarlo.
  const openEditor = (r: Row, from: HTMLElement) => {
    trigger.current = from
    setEditing(r)
  }
  const closeEditor = () => {
    setEditing(null)
    trigger.current?.focus()
  }

  const chooseFile = (key: string, kind: 'character' | 'logo') => {
    target.current = { key, kind }
    pick.current?.click()
  }

  const current = editing ? rows.find(r => r.key === editing.key) ?? editing : null

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Editoras de la portada</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El logo se busca solo en Wikidata y puedes cambiarlo si no se lee bien. Sube un personaje en PNG
          o WebP con fondo transparente. Para subir varios a la vez, nombra cada archivo como su editora
          (nintendo.png, sega.png…).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => findLogos(false)} disabled={running} className={`${btn} bg-primary text-primary-foreground border-transparent hover:bg-primary/90`}>
          {running ? 'Buscando logos…' : 'Buscar logos'}
        </button>
        <button type="button" onClick={() => findLogos(true)} disabled={running} className={btn}>
          Repetir todos
        </button>
        <button type="button" onClick={() => many.current?.click()} className={btn}>
          Subir varios personajes
        </button>
      </div>
      {note && <p role="status" className="text-sm text-amber-400">{note}</p>}
      <input ref={many} type="file" multiple accept="image/png,image/webp" className="hidden" tabIndex={-1} aria-hidden="true"
             onChange={e => { if (e.target.files?.length) uploadMany(e.target.files); e.target.value = '' }} />
      <input ref={pick} type="file" accept="image/png,image/webp" className="hidden" tabIndex={-1} aria-hidden="true"
             onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />

      <ul className="divide-y divide-border rounded-xl border border-border">
        {rows.map(r => {
          const logo = resolveCoverPath(r.art?.logo ?? null)
          const character = resolveCoverPath(r.art?.character ?? null)
          const status = [logo ? 'con logo' : r.art?.checkedAt ? 'sin logo' : 'sin buscar', character ? 'con personaje' : null]
            .filter(Boolean).join(' · ')
          return (
            <li key={r.key} className="flex items-center gap-4 p-3">
              <div aria-hidden="true" className="grid h-14 w-24 shrink-0 place-items-center rounded-md"
                   style={{ background: `linear-gradient(135deg, ${r.art?.colors?.[0] ?? '#333'}, ${r.art?.colors?.[1] ?? '#111'})` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo && <img src={logo} alt="" className={`max-h-9 max-w-[80%] object-contain ${r.art?.plain ? '' : 'brightness-0 invert'}`} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                <p className="text-sm text-muted-foreground">{r.games} juegos · {status}</p>
              </div>
              <button type="button" onClick={e => openEditor(r, e.currentTarget)} aria-label={`Editar la tesela de ${r.name}`} className={btn}>
                Editar
              </button>
            </li>
          )
        })}
      </ul>

      {current && (
        <PublisherEditDialog
          row={current}
          busy={busy === current.key}
          onClose={closeEditor}
          onTemplate={t => saveStyleFor(current.key, { template: t })}
          onBackdrop={b => saveStyleFor(current.key, { backdrop: b })}
          onPlain={plain => savePlainFor(current.key, plain)}
          onLayout={layout => saveLayoutFor(current.key, layout)}
          onUploadLogo={() => chooseFile(current.key, 'logo')}
          onUploadCharacter={() => chooseFile(current.key, 'character')}
          onRemoveCharacter={() => remove(current.key)}
          onFile={file => uploadTo(current.key, 'character', file)}
        />
      )}
    </div>
  )
}

// Where the character and the logo sit when nobody has moved them: the same boxes the home
// draws by default, so the preview and the home agree from the start.
// The character keeps its whole picture: only its width is set, the height follows the image.
const DEFAULT_CHARACTER: Place = { x: 50, y: 40, w: 72 }
const DEFAULT_LOGO_WITH_CHARACTER: Place = { x: 50, y: 89, h: 11 }
const DEFAULT_LOGO_ALONE: Place = { x: 50, y: 50, w: 82, h: 10 }

function arrangedFrom(layout: PublisherLayout | null | undefined, hasCharacter: boolean, hasLogo: boolean): PublisherLayout {
  const out: PublisherLayout = { ...(layout ?? {}) }
  if (hasCharacter && !out.character) out.character = DEFAULT_CHARACTER
  if (hasLogo && !out.logo) out.logo = hasCharacter ? DEFAULT_LOGO_WITH_CHARACTER : DEFAULT_LOGO_ALONE
  return out
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * Diálogo de edición de una tesela. La vista previa es la tesela real: se arrastran el logo
 * y el personaje, y una esquina cambia su tamaño. Foco dentro mientras está abierto, Escape
 * lo cierra, y las flechas mueven el elemento seleccionado.
 */
function PublisherEditDialog({ row, busy, onClose, onTemplate, onBackdrop, onPlain, onLayout, onUploadLogo, onUploadCharacter, onRemoveCharacter, onFile }: {
  row: Row
  busy: boolean
  onClose: () => void
  onTemplate: (t: TileTemplate) => void
  onBackdrop: (b: BackdropStyle | 'auto') => void
  onPlain: (plain: boolean) => void
  onLayout: (layout: PublisherLayout) => void
  onUploadLogo: () => void
  onUploadCharacter: () => void
  onRemoveCharacter: () => void
  onFile: (file: File) => void
}) {
  const dialog = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const title = useId()
  const logo = resolveCoverPath(row.art?.logo ?? null)
  const character = resolveCoverPath(row.art?.character ?? null)
  const template = row.art?.style?.template ?? DEFAULT_TEMPLATE
  const backdrop = row.art?.style?.backdrop ?? 'auto'
  const color = row.art?.plain === true

  const [draft, setDraft] = useState<PublisherLayout>(() => arrangedFrom(row.tile.layout, !!character, !!logo))
  const draftRef = useRef(draft)
  const [selected, setSelected] = useState<TileElement | null>(null)
  const drag = useRef<{ el: TileElement; mode: 'move' | 'resize'; start: Place; px: number; py: number } | null>(null)

  const update = (next: PublisherLayout) => { draftRef.current = next; setDraft(next) }

  // Búsqueda de imágenes: se abre en otra pestaña con la consulta; la imagen que elijas se pega aquí.
  const [query, setQuery] = useState(`${row.name} mascota png`)
  const searchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`

  const pickImage = (list: FileList | DataTransferItemList | null | undefined) => {
    if (!list || busy) return null
    const files = Array.from(list as ArrayLike<DataTransferItem | File>)
    for (const item of files) {
      const file = item instanceof File ? item : item.kind === 'file' && item.type.startsWith('image/') ? item.getAsFile() : null
      if (file && file.type.startsWith('image/')) return file
    }
    return null
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = pickImage(e.clipboardData?.items)
      if (file) { e.preventDefault(); onFile(file) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('h2')?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Tab no sale del diálogo mientras está abierto.
  const trap = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialog.current) return
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]'))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const begin = (el: TileElement, mode: 'move' | 'resize', e: React.PointerEvent<HTMLElement>) => {
    const start = draftRef.current[el]
    if (!start) return
    setSelected(el)
    drag.current = { el, mode, start, px: e.clientX, py: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.stopPropagation()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const r = box.current?.getBoundingClientRect()
    if (!d || !r) return
    const dx = ((e.clientX - d.px) / r.width) * 100
    const dy = ((e.clientY - d.py) / r.height) * 100
    if (d.mode === 'move') {
      update({ ...draftRef.current, [d.el]: { ...d.start, x: clamp(d.start.x + dx, 0, 100), y: clamp(d.start.y + dy, 0, 100) } })
      return
    }
    // The corner keeps the element's proportions: both sides scale by the same factor.
    const base = d.start.w ?? 50
    const f = clamp((base + dx) / base, 0.2, 4)
    update({
      ...draftRef.current,
      [d.el]: { ...d.start, w: clamp(base * f, 5, 200), h: d.start.h !== undefined ? clamp(d.start.h * f, 3, 200) : undefined },
    })
  }

  const endDrag = () => {
    if (!drag.current) return
    drag.current = null
    onLayout(draftRef.current)
  }

  // Las flechas mueven el elemento seleccionado (Mayús. para moverlo más deprisa).
  const nudge = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!selected) return
    const step = e.shiftKey ? 5 : 1
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const m = moves[e.key]
    if (!m) return
    e.preventDefault()
    const cur = draftRef.current[selected]
    if (!cur) return
    const next = { ...draftRef.current, [selected]: { ...cur, x: clamp(cur.x + m[0], 0, 100), y: clamp(cur.y + m[1], 0, 100) } }
    update(next)
    onLayout(next)
  }

  const preview: PublisherTileData = { ...row.tile, layout: draft, template, backdrop: row.tile.backdrop }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={title} onKeyDown={e => { trap(e); nudge(e) }}
           className="flex max-h-full w-full max-w-3xl flex-col gap-5 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl sm:flex-row">

        {/* La tesela tal como la pinta la portada; se ajusta arrastrando. */}
        <div className="mx-auto flex shrink-0 flex-col items-center gap-2">
          <div
            ref={box}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="relative aspect-[3/4] w-[240px] overflow-hidden rounded-lg"
            style={{ '--c1': row.tile.colors[0] ?? '#3a3a55', '--c2': row.tile.colors[1] ?? '#14141f' } as React.CSSProperties}
          >
            <PublisherTileFace
              publisher={preview}
              gamesLabel=""
              edit={{
                onMove: (el, e) => begin(el, 'move', e),
                onResize: (el, e) => begin(el, 'resize', e),
                onSelect: el => setSelected(el),
                selected,
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Arrastra el logo o el personaje. La esquina cambia el tamaño.</p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={title} tabIndex={-1} className="truncate text-lg font-semibold outline-none">{row.name}</h2>
              <p className="text-sm text-muted-foreground">{row.games} juegos</p>
            </div>
            <button type="button" onClick={onClose} className={btn}>Cerrar</button>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Plantilla</legend>
            <div className="flex flex-wrap gap-2">
              {TILE_TEMPLATES.map(t => (
                <label key={t} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm has-[:checked]:border-violet-500 has-[:checked]:bg-violet-500/15 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${template === t ? 'border-violet-500 bg-violet-500/15' : 'border-border hover:bg-secondary'}`}>
                  <input type="radio" name={`plantilla-${row.key}`} value={t} checked={template === t} disabled={busy}
                         onChange={() => onTemplate(t)} className="sr-only" />
                  {TEMPLATE_LABEL[t]}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Fondo</span>
            <select value={backdrop} disabled={busy} onChange={e => onBackdrop(e.target.value as BackdropStyle | 'auto')}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="auto">Automático (el de la marca)</option>
              {BACKDROP_STYLES.map(b => <option key={b} value={b}>{BACKDROP_LABEL[b]}</option>)}
            </select>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Logo</legend>
            {logo ? (
              <div className="flex flex-wrap gap-2">
                <label className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${!color ? 'border-violet-500 bg-violet-500/15' : 'border-border hover:bg-secondary'}`}>
                  <input type="radio" name={`logo-${row.key}`} checked={!color} disabled={busy} onChange={() => onPlain(false)} className="sr-only" />
                  En blanco
                </label>
                <label className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${color ? 'border-violet-500 bg-violet-500/15' : 'border-border hover:bg-secondary'}`}>
                  <input type="radio" name={`logo-${row.key}`} checked={color} disabled={busy} onChange={() => onPlain(true)} className="sr-only" />
                  En su color
                </label>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Esta editora no tiene logo todavía.</p>
            )}
            <div>
              <button type="button" disabled={busy} onClick={onUploadLogo} className={btn}>
                {logo ? 'Cambiar logo' : 'Subir logo'}
              </button>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2"
                    onDragOver={e => { if (!busy) e.preventDefault() }}
                    onDrop={e => { const file = pickImage(e.dataTransfer.items); if (file) { e.preventDefault(); onFile(file) } }}>
            <legend className="mb-1 text-sm font-medium">Personaje</legend>
            <p className="text-sm text-muted-foreground">{character ? 'Tiene personaje.' : 'Sin personaje: el logo va grande en el centro.'}</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Qué buscar
                <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                       className="w-56 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
              <a href={searchUrl} target="_blank" rel="noopener noreferrer" className={btn}>
                Buscar imagen (nueva pestaña)
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              Copia la imagen que quieras (clic derecho, copiar imagen) y pégala aquí con Ctrl+V, o arrástrala a este recuadro.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={onUploadCharacter} className={btn}>
                {character ? 'Cambiar personaje' : 'Subir personaje'}
              </button>
              {character && (
                <button type="button" disabled={busy} onClick={onRemoveCharacter} className={btn}>Quitar personaje</button>
              )}
            </div>
          </fieldset>

          <p role="status" aria-live="polite" className="mt-auto text-sm text-muted-foreground">{busy ? 'Guardando…' : ''}</p>
        </div>
      </div>
    </div>
  )
}
