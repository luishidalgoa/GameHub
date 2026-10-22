'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveCoverPath } from '@/lib/cover-url'
import { publisherKey } from '@/lib/publishers'
import { PublisherCanvas } from './PublisherCanvas'

interface Row {
  key: string
  name: string
  games: number
  art: { logo: string | null; plain?: boolean; character: string | null; colors: string[]; checkedAt: string | null; layout?: { character?: { x: number; y: number; w: number }; logo?: { x: number; y: number; w: number } } } | null
}

/**
 * The art of the publishers rail: logos are looked up automatically; a character
 * cut-out (a PNG or WebP with transparency) is uploaded here, one per publisher.
 */
export function PublisherArtPanel() {
  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<Row | null>(null)
  const many = useRef<HTMLInputElement>(null)
  const pick = useRef<HTMLInputElement>(null)
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
  // Several characters at once: each file is named after its publisher ("nintendo.png").
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
    await fetch('/api/admin/publishers', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }),
    })
    load()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Editoras de la portada</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El logo se busca solo en Wikidata y puedes cambiarlo si no se lee bien. Sube un personaje en PNG
          o WebP con fondo transparente: la tile lo muestra de pie y el logo pasa abajo, pequeño. Sin
          personaje, el logo va grande en el centro. Para subir varios a la vez, nombra cada archivo
          como su editora (nintendo.png, sega.png…).
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => findLogos(false)} disabled={running}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
          {running ? 'Buscando logos…' : 'Buscar logos'}
        </button>
        <button onClick={() => findLogos(true)} disabled={running}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50">
          Repetir todos
        </button>
        <button onClick={() => many.current?.click()}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">
          Subir varios personajes
        </button>
      </div>
      {note && <p className="text-sm text-amber-400">{note}</p>}
      <input ref={many} type="file" multiple accept="image/png,image/webp" className="hidden"
             onChange={e => { if (e.target.files?.length) uploadMany(e.target.files); e.target.value = '' }} />

      <input ref={pick} type="file" accept="image/png,image/webp" className="hidden"
             onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />

      {editing && (
        <PublisherCanvas row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}

      <ul className="divide-y divide-border rounded-xl border border-border">
        {rows.map(r => {
          const logo = resolveCoverPath(r.art?.logo ?? null)
          const character = resolveCoverPath(r.art?.character ?? null)
          return (
            <li key={r.key} className="flex items-center gap-4 p-3">
              <div className="grid h-14 w-24 shrink-0 place-items-center rounded-md"
                   style={{ background: `linear-gradient(135deg, ${r.art?.colors?.[0] ?? '#333'}, ${r.art?.colors?.[1] ?? '#111'})` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo && <img src={logo} alt="" className={`max-h-9 max-w-[80%] object-contain ${r.art?.plain ? '' : 'brightness-0 invert'}`} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.games} juegos · {logo ? 'logo encontrado' : r.art?.checkedAt ? 'sin logo' : 'sin buscar'}
                </p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {character && <img src={character} alt="" className="h-14 w-auto object-contain" />}
              <div className="flex gap-2">
                {(r.art?.character || r.art?.logo) && (
                  <button onClick={() => setEditing(r)} className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary">
                    Ajustar
                  </button>
                )}
                <button disabled={busy === r.key} onClick={() => { target.current = { key: r.key, kind: 'logo' }; pick.current?.click() }}
                        className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary">
                  Cambiar logo
                </button>
                <button disabled={busy === r.key} onClick={() => { target.current = { key: r.key, kind: 'character' }; pick.current?.click() }}
                        className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary">
                  {character ? 'Cambiar personaje' : 'Subir personaje'}
                </button>
                {character && (
                  <button onClick={() => remove(r.key)} className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary">Quitar</button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
