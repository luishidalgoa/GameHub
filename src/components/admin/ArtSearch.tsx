'use client'

import { useState } from 'react'
import { AdminButton } from '@/components/admin/AdminButton'

// Búsqueda manual de banner, fondo y logo en SteamGridDB y en Steam. El dueño busca el juego,
// elige la aplicación y una imagen, y esa imagen se guarda igual que una pegada por enlace.

export type ArtSlot = 'banner' | 'fanart' | 'logo'
type Source = 'steamgriddb' | 'steam'

const SOURCES_OF: Record<ArtSlot, Source[]> = {
  banner: ['steamgriddb'],
  fanart: ['steamgriddb', 'steam'],
  logo:   ['steamgriddb'],
}
const SOURCE_NAME: Record<Source, string> = { steamgriddb: 'SteamGridDB', steam: 'Steam' }
// Qué imágenes de SteamGridDB sirven para cada hueco: el banner y el fondo son «heroes», el logo es «logos».
const SGDB_TYPE: Record<ArtSlot, 'heroes' | 'logos'> = { banner: 'heroes', fanart: 'heroes', logo: 'logos' }

interface Match { id: number; name: string }
interface Pick { url: string; thumb: string }

export function ArtSearch({ slot, initialQuery, disabled, onUse }: {
  slot: ArtSlot
  initialQuery: string
  disabled: boolean
  onUse: (url: string) => Promise<void>
}) {
  const sources = SOURCES_OF[slot]
  const [source, setSource] = useState<Source>(sources[0])
  const [query, setQuery] = useState(initialQuery)
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [images, setImages] = useState<Pick[] | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchJson = async (url: string) => {
    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
    return data
  }

  const search = async () => {
    if (!query.trim()) return
    setLoading(true); setError(''); setImages(null); setChosen(null)
    try {
      const q = encodeURIComponent(query.trim())
      const data = await fetchJson(source === 'steam' ? `/api/covers/steam?q=${q}` : `/api/covers/steamgriddb?q=${q}`)
      setMatches(data.games ?? [])
    } catch (err) {
      setMatches(null)
      setError(err instanceof Error ? err.message : 'Error de búsqueda')
    } finally {
      setLoading(false)
    }
  }

  const choose = async (match: Match) => {
    setLoading(true); setError(''); setImages(null); setChosen(match.name)
    try {
      const url = source === 'steam'
        ? `/api/covers/steam?appId=${match.id}`
        : `/api/covers/steamgriddb?gameId=${match.id}&type=${SGDB_TYPE[slot]}`
      const data = await fetchJson(url)
      const list: Pick[] = source === 'steam' ? (data.images ?? []) : (data.covers ?? [])
      setImages(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las imágenes')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-border p-4 space-y-3" aria-label={`Buscar ${slot} en otras fuentes`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Buscar en otras fuentes</p>
        {sources.length > 1 && (
          <div role="group" aria-label="Fuente" className="flex gap-1">
            {sources.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => { setSource(s); setMatches(null); setImages(null); setChosen(null) }}
                className={`rounded border px-2 py-0.5 text-xs ${source === s ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}
                aria-pressed={source === s}
              >
                {SOURCE_NAME[s]}
              </button>
            ))}
          </div>
        )}
      </div>

      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void search() }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Título del juego"
          aria-label="Título para buscar"
          className="flex-1 bg-secondary border border-border rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <AdminButton type="submit" variant="secondary" size="md" disabled={disabled || loading || !query.trim()}>Buscar</AdminButton>
      </form>

      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      {loading && <p className="text-xs text-muted-foreground">Buscando…</p>}

      {matches && !chosen && (
        matches.length === 0
          ? <p className="text-xs text-muted-foreground">Sin resultados en {SOURCE_NAME[source]}.</p>
          : (
            <ul className="space-y-1" aria-label={`Juegos en ${SOURCE_NAME[source]}`}>
              {matches.map(m => (
                <li key={m.id}>
                  <button type="button" onClick={() => void choose(m)} disabled={disabled || loading}
                    className="w-full text-left rounded px-2 py-1.5 text-sm hover:bg-secondary">
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )
      )}

      {chosen && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {chosen} · <button type="button" className="underline" onClick={() => { setChosen(null); setImages(null) }}>volver a los juegos</button>
          </p>
          {images && images.length === 0 && <p className="text-xs text-muted-foreground">{SOURCE_NAME[source]} no tiene imágenes de este tipo para el juego.</p>}
          {images && images.length > 0 && (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2" aria-label={`Imágenes de ${SOURCE_NAME[source]}`}>
              {images.map((img, i) => (
                <li key={`${img.url}-${i}`} className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.thumb || img.url} alt="" className="w-full rounded border border-border object-cover aspect-video bg-secondary" />
                  <AdminButton type="button" variant="primary" size="sm" disabled={disabled || loading} onClick={() => void onUse(img.url)}>
                    Usar esta
                  </AdminButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
