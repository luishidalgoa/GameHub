'use client'

import { useEffect, useState } from 'react'
import { Search, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { AdminButton } from '@/components/admin/AdminButton'
import { SLOT_SEARCH_LABEL, type ImageSlot, type ImageSourceId } from '@/lib/providers/catalog'

// El buscador de imágenes de un hueco: portadas, banners, logos, fondos o capturas. Las pestañas
// son las fuentes que cubren ese hueco (las da el servidor, src/lib/providers/images.ts), así que
// una fuente nueva aparece aquí sin tocar este archivo. Elegir una imagen se la pasa a quien lo usa.

interface SourceInfo { id: ImageSourceId; label: string; available: boolean }
interface Img { url: string; thumb: string }
interface Match { id: string; name: string; thumb?: string; images?: Img[] }
interface TabState { query: string; matches: Match[] | null; chosen: Match | null; images: Img[] | null; loading: boolean; error: string }

const blankTab = (query: string): TabState => ({ query, matches: null, chosen: null, images: null, loading: false, error: '' })

interface Props {
  slot: ImageSlot
  gameId: number
  gameTitle: string
  platformSlug: string
  /** Guarda la imagen elegida en el hueco. `source` es la fuente que la dio. */
  onPick: (url: string, source: ImageSourceId) => Promise<void> | void
  disabled?: boolean
}

export function ImageSearch({ slot, gameId, gameTitle, platformSlug, onPick, disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const [sources, setSources] = useState<SourceInfo[] | null>(null)
  const [tab, setTab] = useState<ImageSourceId | null>(null)
  const [tabs, setTabs] = useState<Partial<Record<ImageSourceId, TabState>>>({})
  const [busyUrl, setBusyUrl] = useState<string | null>(null)

  // Las fuentes del hueco se piden al abrir: una sola vez por montaje.
  useEffect(() => {
    if (!open || sources) return
    fetch(`/api/covers/providers?slot=${slot}&platform=${encodeURIComponent(platformSlug)}`)
      .then(r => r.json())
      .then((data: { sources?: SourceInfo[] }) => {
        const list = data.sources ?? []
        setSources(list)
        const first = list.find(s => s.available)
        if (first) setTab(first.id)
      })
      .catch(() => setSources([]))
  }, [open, sources, slot, platformSlug])

  const tabOf = (id: ImageSourceId): TabState => tabs[id] ?? blankTab(gameTitle)
  const patch = (id: ImageSourceId, change: Partial<TabState>) =>
    setTabs(prev => ({ ...prev, [id]: { ...(prev[id] ?? blankTab(gameTitle)), ...change } }))

  const run = async (id: ImageSourceId, url: string): Promise<{ data: Record<string, unknown> } | null> => {
    patch(id, { loading: true, error: '' })
    try {
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
      return { data }
    } catch (err) {
      patch(id, { error: err instanceof Error ? err.message : 'Error de búsqueda' })
      return null
    } finally {
      patch(id, { loading: false })
    }
  }

  const search = async (id: ImageSourceId) => {
    const q = tabOf(id).query.trim()
    if (!q) return
    patch(id, { matches: null, chosen: null, images: null })
    const out = await run(id, `/api/covers/search?provider=${id}&slot=${slot}&q=${encodeURIComponent(q)}&gameId=${gameId}`)
    if (out) patch(id, { matches: (out.data.matches as Match[]) ?? [] })
  }

  const choose = async (id: ImageSourceId, match: Match) => {
    // Lo que la búsqueda ya trajo se muestra al instante; lo demás se pide a la fuente.
    if (match.images) { patch(id, { chosen: match, images: match.images }); return }
    patch(id, { chosen: match, images: null })
    const out = await run(id, `/api/covers/search?provider=${id}&slot=${slot}&id=${encodeURIComponent(match.id)}&gameId=${gameId}`)
    if (out) patch(id, { images: (out.data.images as Img[]) ?? [] })
  }

  const use = async (id: ImageSourceId, img: Img) => {
    setBusyUrl(img.url)
    try { await onPick(img.url, id) } finally { setBusyUrl(null) }
  }

  const current = tab ? tabOf(tab) : null

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <span className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5" />
          Buscar {SLOT_SEARCH_LABEL[slot]}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="border-t border-border bg-secondary/30 p-3 space-y-3">
          {!sources && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          {sources && sources.length === 0 && <p className="text-xs text-muted-foreground">Ninguna fuente cubre este hueco.</p>}

          {sources && sources.length > 0 && (
            <>
              <div role="tablist" className="flex flex-wrap gap-1">
                {sources.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === s.id}
                    disabled={!s.available || disabled}
                    title={s.available ? undefined : `${s.label} no responde para esta plataforma`}
                    onClick={() => setTab(s.id)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors disabled:opacity-50 ${
                      tab === s.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {tab && current && (
                <div className="space-y-3">
                  <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void search(tab) }}>
                    <input
                      value={current.query}
                      onChange={e => patch(tab, { query: e.target.value })}
                      placeholder="Título del juego"
                      aria-label="Título para buscar"
                      className="flex-1 bg-secondary border border-border rounded-md px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <AdminButton type="submit" variant="secondary" size="md" disabled={disabled || current.loading || !current.query.trim()}>
                      <Search className="w-3.5 h-3.5" />
                      Buscar
                    </AdminButton>
                  </form>

                  {current.loading && <p className="text-xs text-muted-foreground">Buscando…</p>}
                  {current.error && <p role="alert" className="text-xs text-red-300">{current.error}</p>}

                  {current.matches && !current.chosen && (
                    current.matches.length === 0
                      ? <p className="text-xs text-muted-foreground">Sin resultados.</p>
                      : (
                        <ul className="space-y-1" aria-label="Resultados">
                          {current.matches.map(m => (
                            <li key={m.id}>
                              <button
                                type="button"
                                onClick={() => void choose(tab, m)}
                                disabled={disabled || current.loading}
                                className="w-full flex items-center gap-3 text-left rounded px-2 py-1.5 text-sm hover:bg-secondary"
                              >
                                {m.thumb && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={m.thumb} alt="" className="w-8 h-10 object-cover rounded bg-secondary flex-shrink-0" />
                                )}
                                <span className="truncate">{m.name}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )
                  )}

                  {current.chosen && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {current.chosen.name} · <button type="button" className="underline" onClick={() => patch(tab, { chosen: null, images: null })}>volver a los resultados</button>
                      </p>
                      {current.images && current.images.length === 0 && <p className="text-xs text-muted-foreground">Sin imágenes de este tipo para el juego.</p>}
                      {current.images && current.images.length > 0 && (
                        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2" aria-label="Imágenes">
                          {current.images.map((img, i) => (
                            <li key={`${img.url}-${i}`} className="space-y-1">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img.thumb || img.url} alt="" className="w-full rounded border border-border object-contain aspect-video bg-secondary" />
                              <AdminButton type="button" variant="primary" size="sm" disabled={disabled || busyUrl !== null} onClick={() => void use(tab, img)}>
                                {busyUrl === img.url ? 'Guardando…' : 'Usar esta'}
                              </AdminButton>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
