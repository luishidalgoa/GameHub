'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { resolveCoverPath } from '@/lib/cover-url'
import { publisherKey } from '@/lib/publishers'
import { BACKDROP_LABEL, BACKDROP_STYLES, DEFAULT_TEMPLATE, TEMPLATE_LABEL, TILE_TEMPLATES, type BackdropStyle, type TileTemplate } from '@/lib/publisher-style'
import { PublisherCanvas } from './PublisherCanvas'

interface Row {
  key: string
  name: string
  games: number
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
  const [adjusting, setAdjusting] = useState<Row | null>(null)
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

  const savePlainFor = async (key: string, plain: boolean) => {
    setBusy(key)
    await fetch('/api/admin/publishers', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, plain }),
    })
    setBusy(null)
    load()
  }

  const upload = async (file: File) => {
    setBusy(target.current.key)
    const form = new FormData()
    form.set('key', target.current.key)
    form.set('kind', target.current.kind)
    form.set('file', file)
    await fetch('/api/admin/publishers', { method: 'PUT', body: form })
    setBusy(null)
    load()
  }

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

      {current && !adjusting && (
        <PublisherEditDialog
          row={current}
          busy={busy === current.key}
          onClose={closeEditor}
          onTemplate={t => saveStyleFor(current.key, { template: t })}
          onBackdrop={b => saveStyleFor(current.key, { backdrop: b })}
          onPlain={plain => savePlainFor(current.key, plain)}
          onUploadLogo={() => chooseFile(current.key, 'logo')}
          onUploadCharacter={() => chooseFile(current.key, 'character')}
          onRemoveCharacter={() => remove(current.key)}
          onAdjust={() => setAdjusting(current)}
        />
      )}

      {adjusting && (
        <PublisherCanvas
          row={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => { setAdjusting(null); load() }}
        />
      )}
    </div>
  )
}

/**
 * Diálogo de edición de una tesela. Foco dentro mientras está abierto, Escape lo cierra,
 * y cada control tiene una etiqueta visible.
 */
function PublisherEditDialog({ row, busy, onClose, onTemplate, onBackdrop, onPlain, onUploadLogo, onUploadCharacter, onRemoveCharacter, onAdjust }: {
  row: Row
  busy: boolean
  onClose: () => void
  onTemplate: (t: TileTemplate) => void
  onBackdrop: (b: BackdropStyle | 'auto') => void
  onPlain: (plain: boolean) => void
  onUploadLogo: () => void
  onUploadCharacter: () => void
  onRemoveCharacter: () => void
  onAdjust: () => void
}) {
  const dialog = useRef<HTMLDivElement>(null)
  const title = useId()
  const logo = resolveCoverPath(row.art?.logo ?? null)
  const character = resolveCoverPath(row.art?.character ?? null)
  const template = row.art?.style?.template ?? DEFAULT_TEMPLATE
  const backdrop = row.art?.style?.backdrop ?? 'auto'
  const color = row.art?.plain === true

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
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])'))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={title} onKeyDown={trap}
           className="flex max-h-full w-full max-w-3xl flex-col gap-5 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl sm:flex-row">

        {/* Vista previa: decorativa, la tesela real está en la portada. */}
        <div aria-hidden="true" className="relative mx-auto aspect-[3/4] w-40 shrink-0 overflow-hidden rounded-lg sm:w-48"
             style={{ background: `linear-gradient(160deg, ${row.art?.colors?.[0] ?? '#3a3a55'}, ${row.art?.colors?.[1] ?? '#14141f'})` }}>
          {character && <img src={character} alt="" className="absolute inset-x-[8%] bottom-[25%] top-[9%] h-auto w-[84%] max-w-none object-cover object-top" />}
          {logo && <img src={logo} alt="" className={`absolute left-1/2 top-1/2 w-[80%] -translate-x-1/2 -translate-y-1/2 object-contain ${color ? '' : 'brightness-0 invert'}`} />}
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

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Personaje</legend>
            <p className="text-sm text-muted-foreground">{character ? 'Tiene personaje.' : 'Sin personaje: el logo va grande en el centro.'}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={onUploadCharacter} className={btn}>
                {character ? 'Cambiar personaje' : 'Subir personaje'}
              </button>
              {character && (
                <>
                  <button type="button" disabled={busy} onClick={onAdjust} className={btn}>Colocar en el lienzo</button>
                  <button type="button" disabled={busy} onClick={onRemoveCharacter} className={btn}>Quitar personaje</button>
                </>
              )}
            </div>
          </fieldset>

          <p role="status" aria-live="polite" className="mt-auto text-sm text-muted-foreground">{busy ? 'Guardando…' : ''}</p>
        </div>
      </div>
    </div>
  )
}
