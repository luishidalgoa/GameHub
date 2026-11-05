'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useInfinitePages } from './useInfinitePages'
import { SortHeader } from './SortHeader'
import { GamePanel, type PanelGame } from './GamePanel'
import { GameBulkBar } from './GameBulkBar'
import { DeleteGameButton } from './GraveyardClient'
import { FIELD_WEIGHTS, type FieldKey } from '@/lib/games/completeness'
import { AdminButton } from '@/components/admin/AdminButton'
import { formatBytes } from '@/lib/utils'
import type { AdminGameRow } from '@/lib/games/list'

// The admin's game table, shared by the library and the graveyard. Rows arrive a page
// at a time from the list API as the reader scrolls: the table never holds the whole
// library, and a sort or filter change starts again from the first page.
// In the library, a click anywhere on a row opens its panel, and the checkbox selects
// rows for the bulk bar.

const MISSING_NAME = Object.fromEntries(FIELD_WEIGHTS.map(f => [f.key, f.label])) as Record<FieldKey, string>

interface SavedScroll { size: number; y: number }

function readSaved(key: string): SavedScroll | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const s = JSON.parse(raw) as SavedScroll
    return typeof s?.size === 'number' && typeof s?.y === 'number' ? s : null
  } catch {
    return null
  }
}

export interface AdminTablePanel {
  game: PanelGame
  percent: number
  missing: FieldKey[]
  imagesHref: string
  closeHref: string
}

interface Props {
  variant: 'library' | 'graveyard'
  /** Filters and sort as a query string, without the page. */
  query: string
  sort: { key: string; dir: 'asc' | 'desc' }
  /** The header link for each sortable column, built on the server. */
  sortLinks: Record<string, string>
  /** The game panel, when one is open (library only). */
  panel?: AdminTablePanel | null
}

export function AdminGameTable({ variant, query, sort, sortLinks, panel = null }: Props) {
  const router = useRouter()
  const endpoint = variant === 'library' ? '/api/admin/games/list' : '/api/admin/graveyard/list'
  const restoreKey = `admin-table:${variant}:${query}`
  // The position is restored once, on the first mount of this query: it reopens the
  // pages the reader had loaded, so the scroll lands where it was.
  const [saved] = useState(() => (typeof window === 'undefined' ? null : readSaved(restoreKey)))
  const restored = useRef(false)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())

  const { items, total, hasMore, loaded: data, isLoading, isValidating, failed, mutate, sentinelRef, size } = useInfinitePages<AdminGameRow>({
    url: endpoint,
    query,
    initialSize: saved?.size ?? 1,
  })

  // A new filter or sort is a new list: the old selection does not apply to it.
  useEffect(() => { setSelected(new Set()) }, [query])

  // Restore the scroll once the saved pages are in.
  useEffect(() => {
    if (!saved || restored.current || !data) return
    restored.current = true
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, saved.y)))
  }, [data, saved])

  // Save the position and the loaded pages while scrolling, throttled to a frame.
  const live = useRef({ size, restoreKey })
  live.current = { size, restoreKey }
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const { size: s, restoreKey: k } = live.current
        try { sessionStorage.setItem(k, JSON.stringify({ size: s, y: window.scrollY } satisfies SavedScroll)) } catch { /* storage full or blocked */ }
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  // The panel moves between the loaded rows with the arrow keys.
  const idx = panel ? items.findIndex(r => r.id === panel.game.id) : -1
  const panelRow = (id: number) => `/admin/games?${query}${query ? '&' : ''}panel=${id}`
  const prevHref = variant === 'library' && idx > 0 ? panelRow(items[idx - 1].id) : null
  const nextHref = variant === 'library' && idx >= 0 && idx < items.length - 1 ? panelRow(items[idx + 1].id) : null
  const openPanel = (id: number) => router.push(panelRow(id), { scroll: false })

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const allLoadedChecked = items.length > 0 && items.every(r => selected.has(r.id))
  const toggleAllLoaded = () => setSelected(prev => {
    const next = new Set(prev)
    if (allLoadedChecked) items.forEach(r => next.delete(r.id))
    else items.forEach(r => next.add(r.id))
    return next
  })

  const cols = variant === 'library'
    ? [
        { key: 'title', label: 'Título' },
        { key: 'platform', label: 'Plataforma' },
        { key: 'year', label: 'Año' },
        { key: 'featured', label: 'En portada' },
        { key: 'meta', label: 'Metadatos' },
        { key: 'missing', label: 'Faltan' },
        { key: 'size', label: 'Tamaño', align: 'right' as const },
      ]
    : [
        { key: 'title', label: 'Título' },
        { key: 'platform', label: 'Plataforma' },
        { key: 'region', label: 'Región' },
        { key: 'size', label: 'Tamaño', align: 'right' as const },
        { key: 'lastSeen', label: 'Visto por última vez' },
      ]

  const colSpan = cols.length + 2 + (variant === 'library' ? 1 : 0)
  const showEmpty = data !== undefined && items.length === 0 && !hasMore

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="tabular-nums">{total === null ? 'Cargando…' : `${total.toLocaleString('es-ES')} juegos`}</span>
        {isValidating && items.length > 0 && <span>Cargando más…</span>}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                {variant === 'library' && (
                  <th scope="col" className="w-10 px-3 py-3 font-medium">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar los juegos cargados"
                      checked={allLoadedChecked}
                      onChange={toggleAllLoaded}
                      disabled={items.length === 0}
                      className="accent-violet-500"
                    />
                  </th>
                )}
                <th scope="col" className="w-12 px-3 py-3 font-medium"><span className="sr-only">Portada</span></th>
                {cols.map(c => (
                  <SortHeader
                    key={c.key}
                    label={c.label}
                    href={sortLinks[c.key] ?? '#'}
                    active={sort.key === c.key}
                    dir={sort.dir}
                    align={c.align}
                  />
                ))}
                {variant === 'graveyard' && <th scope="col" className="px-3 py-3 font-medium">Ruta</th>}
                <th scope="col" className="px-3 py-3 font-medium"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 8 }, (_, i) => (
                <tr key={`sk${i}`} className="border-b border-border/50 last:border-0">
                  <td colSpan={colSpan} className="px-3 py-2"><div className="h-8 animate-pulse rounded bg-secondary" /></td>
                </tr>
              ))}
              {failed && (
                <tr>
                  <td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-destructive">
                    No se pudo cargar la lista.{' '}
                    <AdminButton variant="ghost" size="sm" type="button" onClick={() => mutate()} className="underline">Reintentar</AdminButton>
                  </td>
                </tr>
              )}
              {showEmpty && (
                <tr><td colSpan={colSpan} className="px-3 py-10 text-center text-muted-foreground">{variant === 'library' ? 'Ningún juego con estos filtros.' : 'El cementerio está vacío con estos filtros.'}</td></tr>
              )}
              {items.map(g => (
                variant === 'library'
                  ? (
                    <LibraryRow
                      key={g.id}
                      row={g}
                      selected={panel?.game.id === g.id}
                      checked={selected.has(g.id)}
                      onToggle={() => toggle(g.id)}
                      onOpen={() => openPanel(g.id)}
                    />
                  )
                  : <GraveyardRow key={g.id} row={g} onDeleted={() => mutate()} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div ref={sentinelRef} className="h-2" aria-hidden="true" />
      {hasMore && !failed && items.length > 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">{isValidating ? 'Cargando más juegos…' : ''}</p>
      )}
      {!hasMore && items.length > 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">Fin de la lista · {items.length.toLocaleString('es-ES')} de {(total ?? 0).toLocaleString('es-ES')}</p>
      )}

      {variant === 'library' && selected.size > 0 && (
        <GameBulkBar
          ids={[...selected]}
          onDone={() => mutate()}
          onClear={() => setSelected(new Set())}
        />
      )}

      {panel && (
        <GamePanel
          game={panel.game}
          percent={panel.percent}
          missing={panel.missing}
          closeHref={panel.closeHref}
          imagesHref={panel.imagesHref}
          prevHref={prevHref}
          nextHref={nextHref}
          onSaved={() => mutate()}
        />
      )}
    </>
  )
}

function Cover({ src, title, dim }: { src: string | null; title: string; dim?: boolean }) {
  return (
    <div className="flex h-10 w-7 items-center justify-center overflow-hidden rounded bg-secondary">
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" loading="lazy" className={`h-full w-full object-cover ${dim ? 'opacity-60' : ''}`} />
        : <span className="text-[9px] font-bold text-muted-foreground">{title.charAt(0).toUpperCase()}</span>}
    </div>
  )
}

// Clicks on the controls inside a row (checkbox, buttons, links) keep their own job;
// a click anywhere else on the row opens the panel.
const INTERACTIVE = 'input,button,a,label,select,textarea'

function LibraryRow({ row: g, selected, checked, onToggle, onOpen }: {
  row: AdminGameRow
  selected: boolean
  checked: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const bar = g.percent >= 70 ? 'bg-emerald-400' : g.percent >= 40 ? 'bg-amber-400' : 'bg-rose-400'
  const missingNames = g.missing.map(k => MISSING_NAME[k])
  const onClick = (e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return
    onOpen()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) onOpen()
  }
  return (
    <tr
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-selected={selected}
      className={`cursor-pointer border-b border-border/50 last:border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'bg-primary/10' : 'hover:bg-accent/30'}`}
    >
      <td className="px-3 py-2">
        <input type="checkbox" aria-label={`Seleccionar ${g.title}`} checked={checked} onChange={onToggle} className="accent-violet-500" />
      </td>
      <td className="px-3 py-2"><Cover src={g.coverSrc} title={g.title} /></td>
      <td className="max-w-xs px-3 py-2"><span className="block truncate font-medium">{g.title}</span></td>
      <td className="px-3 py-2 text-muted-foreground">{g.platformName}</td>
      <td className="px-3 py-2 text-muted-foreground tabular-nums">{g.releaseYear ?? '—'}</td>
      <td className="px-3 py-2 text-xs tabular-nums">
        {g.isFeatured
          ? <span className="rounded-md bg-amber-400/15 px-2 py-0.5 font-medium text-amber-200">{g.featuredOrder ? `Puesto ${g.featuredOrder}` : 'Automático'}</span>
          : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div role="meter" aria-label={`Metadatos de ${g.title}`} aria-valuenow={g.percent} aria-valuemin={0} aria-valuemax={100} className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
            <span className={`block h-full ${bar}`} style={{ width: `${g.percent}%` }} />
          </div>
          <span className="w-10 text-right text-xs tabular-nums">{g.percent} %</span>
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-amber-200">
        {missingNames.length === 0 ? <span className="text-muted-foreground">—</span> : missingNames.slice(0, 3).join(', ') + (missingNames.length > 3 ? ` +${missingNames.length - 3}` : '')}
      </td>
      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{formatBytes(g.fileSize)}</td>
      <td className="px-3 py-2" />
    </tr>
  )
}

function GraveyardRow({ row: g, onDeleted }: { row: AdminGameRow; onDeleted: () => void }) {
  return (
    <tr className="border-b border-border/50 last:border-0 transition-colors hover:bg-accent/20">
      <td className="px-3 py-2"><Cover src={g.coverSrc} title={g.title} dim /></td>
      <td className="max-w-[220px] px-3 py-2"><span className="block truncate font-medium text-muted-foreground">{g.title}</span></td>
      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{g.platformName}</td>
      <td className="px-3 py-2 text-muted-foreground">{g.region ?? '—'}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-muted-foreground tabular-nums">{formatBytes(g.fileSize)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
        {new Date(g.lastSeenAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
      </td>
      <td className="max-w-xs px-3 py-2">
        <span title={g.filePath} className="block truncate font-mono text-xs text-muted-foreground/60">{g.filePath}</span>
      </td>
      <td className="px-3 py-2"><DeleteGameButton id={g.id} onDeleted={onDeleted} /></td>
    </tr>
  )
}
