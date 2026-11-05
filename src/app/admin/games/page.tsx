import Link from 'next/link'
import { db } from '@/lib/db'
import { formatBytes } from '@/lib/utils'
import { parseGameFilters, gameFilterQuery, type GameListFilters } from '@/lib/games/filters'
import { completeness, type FieldKey } from '@/lib/games/completeness'
import { MetaRange } from '@/components/admin/MetaRange'
import { nextSort, parseSort, sortParams } from '@/lib/admin-sort'
import { type PanelGame } from '@/components/admin/GamePanel'
import { AdminGameTable, type AdminTablePanel } from '@/components/admin/AdminGameTable'
import { FileJson, FileSpreadsheet } from 'lucide-react'
import { LIBRARY_SORT_DEFAULT, LIBRARY_SORT_KEYS, type LibrarySortKey } from '@/lib/games/list'
import { AdminButton } from '@/components/admin/AdminButton'
import { blacklistStateOf } from '@/lib/blacklist'

export const dynamic = 'force-dynamic'

const MISSING: { key: FieldKey; label: string }[] = [
  { key: 'cover', label: 'Sin portada' },
  { key: 'score', label: 'Sin nota' },
  { key: 'description', label: 'Sin descripción' },
  { key: 'genre', label: 'Sin género' },
  { key: 'publisher', label: 'Sin editora' },
  { key: 'screenshots', label: 'Sin capturas' },
]
const MISSING_LABEL = Object.fromEntries(MISSING.map(m => [m.key, m.label])) as Record<FieldKey, string>

const STATE_LABEL: Record<string, string> = { hidden: 'Ocultos (cementerio)', visible: 'Visibles' }

// Los parámetros repetidos (missing=cover&missing=score) llegan como lista: se unen en una cadena.
function flatten(sp: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(sp)) out[k] = Array.isArray(v) ? v.join(',') : v
  return out
}

function activeFilterCount(f: GameListFilters): number {
  return [
    f.search, f.platform, f.state, f.region, f.minMeta > 0 ? 'x' : '',
    f.noScore ? 'x' : '', f.noCover ? 'x' : '', f.noBox ? 'x' : '', f.noMeta ? 'x' : '', f.unfindable ? 'x' : '',
    f.favorite ? 'x' : '', f.featured ? 'x' : '', f.online ? 'x' : '',
  ].filter(Boolean).length + f.missing.length
}

export default async function AdminGamesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const flat = flatten(searchParams)
  const filters = parseGameFilters(flat)
  const panelId = parseInt(flat.panel ?? '', 10)
  const sort = parseSort<LibrarySortKey>(flat, LIBRARY_SORT_KEYS, LIBRARY_SORT_DEFAULT)
  const sortExtra = sortParams(sort, LIBRARY_SORT_DEFAULT)

  // The list itself is loaded by the table, page by page, from the same filters and sort.
  const query = gameFilterQuery(filters, sortExtra)
  const listUrl = `/admin/games${query ? `?${query}` : ''}`
  const sortLinks = Object.fromEntries(
    LIBRARY_SORT_KEYS.map(k => [k, `/admin/games?${gameFilterQuery(filters, sortParams(nextSort(sort, k), LIBRARY_SORT_DEFAULT))}`]),
  ) as Record<string, string>
  const exportHref = (format: 'json' | 'csv') => `/api/admin/games/export?format=${format}${query ? `&${query}` : ''}`

  const [platforms, regionRows] = await Promise.all([
    db.platform.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.game.findMany({ where: { region: { not: null } }, distinct: ['region'], select: { region: true } }),
  ])
  const regions = regionRows.map(r => r.region).filter((r): r is string => !!r && r.trim() !== '').sort()

  // Chips: cada uno quita un filtro.
  const chips: { label: string; href: string }[] = []
  const without = (patch: Partial<GameListFilters>) => `/admin/games?${gameFilterQuery({ ...filters, ...patch }, sortExtra)}`
  if (filters.search) chips.push({ label: `Título: ${filters.search}`, href: without({ search: '' }) })
  if (filters.platform) chips.push({ label: `Plataforma: ${platforms.find(p => p.slug === filters.platform)?.name ?? filters.platform}`, href: without({ platform: '' }) })
  for (const k of filters.missing) chips.push({ label: MISSING_LABEL[k], href: without({ missing: filters.missing.filter(m => m !== k) }) })
  if (filters.minMeta > 0) chips.push({ label: `Metadatos ≥ ${filters.minMeta} %`, href: without({ minMeta: 0 }) })
  if (filters.state) chips.push({ label: STATE_LABEL[filters.state] ?? filters.state, href: without({ state: '' }) })
  if (filters.region) chips.push({ label: `Región: ${filters.region}`, href: without({ region: '' }) })
  if (filters.noScore) chips.push({ label: 'Sin nota', href: without({ noScore: false }) })
  if (filters.noCover) chips.push({ label: 'Sin portada', href: without({ noCover: false }) })
  if (filters.noBox) chips.push({ label: 'Sin caja', href: without({ noBox: false }) })
  if (filters.noMeta) chips.push({ label: 'Sin metadatos', href: without({ noMeta: false }) })
  if (filters.unfindable) chips.push({ label: 'No encontrados', href: without({ unfindable: false }) })
  if (filters.favorite) chips.push({ label: 'Favorito', href: without({ favorite: false }) })
  if (filters.featured) chips.push({ label: 'En portada', href: without({ featured: false }) })
  if (filters.online) chips.push({ label: 'Juego en línea', href: without({ online: false }) })

  // Panel: se carga aparte, así sigue abierto aunque el juego ya no esté en la lista cargada.
  const panelGame = Number.isInteger(panelId)
    ? await db.game.findUnique({ where: { id: panelId }, include: { platform: { select: { name: true } } } })
    : null
  const panelBlacklist = panelGame ? await blacklistStateOf(panelGame) : null
  const panelData: PanelGame | null = panelGame && panelBlacklist && {
    id: panelGame.id,
    title: panelGame.title,
    platformName: panelGame.platform.name,
    releaseYear: panelGame.releaseYear,
    fileSizeLabel: formatBytes(panelGame.fileSize),
    filePath: panelGame.filePath,
    description: panelGame.description ?? '',
    customNotes: panelGame.customNotes ?? '',
    genre: panelGame.genre ?? '',
    region: panelGame.region ?? '',
    languages: panelGame.languages ?? '',
    developer: panelGame.developer ?? '',
    publisher: panelGame.publisher ?? '',
    titleId: panelGame.titleId ?? '',
    rawgScore: panelGame.rawgScore,
    scoreSource: panelGame.scoreSource ?? null,
    trailerUrl: panelGame.trailerUrl ?? '',
    isFavorite: panelGame.isFavorite,
    isFeatured: panelGame.isFeatured,
    featuredOrder: panelGame.featuredOrder,
    blacklist: panelBlacklist,
    metadataFetchedAt: panelGame.metadataFetchedAt ? panelGame.metadataFetchedAt.toISOString() : null,
  }
  const panelCompleteness = panelGame ? completeness(panelGame) : null
  const panelReturn = panelGame ? `/admin/games?${gameFilterQuery(filters, { ...sortExtra, panel: String(panelGame.id) })}` : ''
  const panel: AdminTablePanel | null = panelData && panelCompleteness
    ? {
        game: panelData,
        percent: panelCompleteness.percent,
        missing: panelCompleteness.missing,
        closeHref: listUrl,
        imagesHref: `/admin/games/${panelData.id}?volver=${encodeURIComponent(panelReturn)}#imagenes`,
      }
    : null

  const input = 'bg-secondary border border-border rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const filterCount = activeFilterCount(filters)

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Juegos</h2>
          <p className="text-sm text-muted-foreground">{filterCount ? `${filterCount} filtros activos` : 'Sin filtros'}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={exportHref('json')} className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-accent"><FileJson className="h-4 w-4" /> JSON</a>
          <a href={exportHref('csv')} className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-accent"><FileSpreadsheet className="h-4 w-4" /> CSV</a>
        </div>
      </div>

      {/* Barra de búsqueda y filtros: un solo formulario, con el desplegable de filtros dentro. */}
      <form method="get" action="/admin/games" className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" name="search" defaultValue={filters.search} placeholder="Buscar por título" aria-label="Buscar por título" className={`${input} w-56`} />
          <select name="platform" defaultValue={filters.platform} aria-label="Plataforma" className={input}>
            <option value="">Todas las plataformas</option>
            {platforms.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
          <details className="group relative">
            <summary className="cursor-pointer list-none rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500">
              Filtros{filterCount ? ` (${filterCount})` : ''}
            </summary>
            <div className="absolute left-0 z-30 mt-2 w-[min(92vw,30rem)] space-y-4 rounded-xl border border-border bg-card p-5 shadow-2xl">
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm text-muted-foreground">Les falta</legend>
                <div className="grid grid-cols-2 gap-2">
                  {MISSING.map(m => (
                    <label key={m.key} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                      <input type="checkbox" name="missing" value={m.key} defaultChecked={filters.missing.includes(m.key)} className="accent-violet-500" />
                      {m.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <MetaRange name="meta_min" defaultValue={filters.minMeta} />
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm text-muted-foreground">Marcas</legend>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                    <input type="checkbox" name="favorito" value="1" defaultChecked={filters.favorite} className="accent-violet-500" />
                    Favorito
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                    <input type="checkbox" name="destacado" value="1" defaultChecked={filters.featured} className="accent-violet-500" />
                    En portada
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                    <input type="checkbox" name="online" value="1" defaultChecked={filters.online} className="accent-violet-500" />
                    Juego en línea
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                    <input type="checkbox" name="estado" value="hidden" defaultChecked={filters.state === 'hidden'} className="accent-violet-500" />
                    Oculto (cementerio)
                  </label>
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">Región
                  <select name="region" defaultValue={filters.region} className={input}>
                    <option value="">Cualquiera</option>
                    {regions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                <Link href="/admin/games" className="text-sm text-violet-300 underline">Quitar todos</Link>
                <AdminButton variant="primary" size="md" type="submit">Aplicar</AdminButton>
              </div>
            </div>
          </details>
          <AdminButton variant="primary" size="md" type="submit">Buscar</AdminButton>
        </div>
      </form>

      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {chips.map(c => (
            <Link key={c.label} href={c.href} className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/15 px-2.5 py-1 text-violet-200 hover:bg-violet-500/25">
              {c.label} <span aria-hidden="true">×</span><span className="sr-only">Quitar filtro {c.label}</span>
            </Link>
          ))}
        </div>
      )}

      <AdminGameTable
        variant="library"
        query={query}
        sort={{ key: sort.key, dir: sort.dir }}
        sortLinks={sortLinks}
        panel={panel}
      />
    </div>
  )
}
