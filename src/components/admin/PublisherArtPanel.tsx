'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveCoverPath } from '@/lib/cover-url'

interface Row {
  key: string
  name: string
  games: number
  art: { logo: string | null; character: string | null; colors: string[]; checkedAt: string | null } | null
}

/**
 * The art of the publishers rail: logos are looked up automatically; a character
 * cut-out (a PNG or WebP with transparency) is uploaded here, one per publisher.
 */
export function PublisherArtPanel() {
  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const pick = useRef<HTMLInputElement>(null)
  const target = useRef<string>('')

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
    setBusy(target.current)
    const form = new FormData()
    form.set('key', target.current)
    form.set('file', file)
    await fetch('/api/admin/publishers', { method: 'PUT', body: form })
    setBusy(null)
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
          El logo se busca solo en Wikidata. Sube un personaje en PNG o WebP con fondo transparente
          y aparecerá de pie sobre el degradado de la editora.
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
      </div>

      <input ref={pick} type="file" accept="image/png,image/webp" className="hidden"
             onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />

      <ul className="divide-y divide-border rounded-xl border border-border">
        {rows.map(r => {
          const logo = resolveCoverPath(r.art?.logo ?? null)
          const character = resolveCoverPath(r.art?.character ?? null)
          return (
            <li key={r.key} className="flex items-center gap-4 p-3">
              <div className="grid h-14 w-24 shrink-0 place-items-center rounded-md"
                   style={{ background: `linear-gradient(135deg, ${r.art?.colors?.[0] ?? '#333'}, ${r.art?.colors?.[1] ?? '#111'})` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo && <img src={logo} alt="" className="max-h-9 max-w-[80%] object-contain brightness-0 invert" />}
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
                <button disabled={busy === r.key} onClick={() => { target.current = r.key; pick.current?.click() }}
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
