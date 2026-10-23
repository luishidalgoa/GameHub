import Link from 'next/link'
import { db } from '@/lib/db'
import { formatBytes } from '@/lib/utils'
import { resolveCoverPath } from '@/lib/s3'
import { parseGameFilters, gameListWhere, gameFilterQuery, filterByCompleteness, type GameListFilters } from '@/lib/games/filters'
import { completeness, type FieldKey } from '@/lib/games/completeness'
import { MetaRange } from '@/components/admin/MetaRange'
import { GamePanel, type PanelGame } from '@/components/admin/GamePanel'
import { ScrollRestorer } from '@/components/admin/ScrollRestorer'
import { FileJson, FileSpreadsheet, Pencil } from 'lucide-react'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

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
    f.noScore ? 'x' : '', f.noCover ? 'x' : '', f.noMeta ? 'x' : '', f.unfindable ? 'x' : '',
  ].filter(Boolean).length + f.missing.length
}

// Las páginas que se muestran: la primera, la última, las cercanas a la actual y los puntos entre ellas.
function pageWindow(current: number, total: number): (number | 'gap')[] {
  const keep = new Set([1, total, current - 1, current, current + 1].filter(p => p >= 1 && p <= total))
  const sorted = [...keep].sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  for (const p of sorted) {
    if (out.length && typeof out[out.length - 1] === 'number' && p - (out[out.length - 1] as number) > 1) out.push('gap')
    out.push(p)
  }
  return out
}

export default async function AdminGamesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const flat = flatten(searchParams)
  const filters = parseGameFilters(flat)
  const requestedPage = Math.max(1, parseInt(flat.page ?? '1', 10) || 1)
  const panelId = parseInt(flat.panel ?? '', 10)

  const [games, platforms, regionRows] = await Promise.all([
    db.game.findMany({
      where: gameListWhere(filters),
      orderBy: { sortTitle: 'asc' },
      include: { platform: { select: { name: true, slug: true } } },
    }),
    db.platform.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.game.findMany({ where: { region: { not: null } }, distinct: ['region'], select: { region: true } }),
  ])
  const regions = regionRows.map(r => r.region).filter((r): r is string => !!r && r.trim() !== '').sort()

  const rows = filterByCompleteness(games, filters)
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const listUrl = `/admin/games?${gameFilterQuery(filters, { page: String(page) })}`
  const pageHref = (p: number) => `/admin/games?${gameFilterQuery(filters, { page: String(p) })}`
  const rowHref = (id: number) => `/admin/games?${gameFilterQuery(filters, { page: String(page), panel: String(id) })}`
  const exportHref = (format: 'json' | 'csv') => `/api/admin/games/export?format=${format}${gameFilterQuery(filters) ? `&${gameFilterQuery(filters)}` : ''}`
  const hiddenInputs = [...new URLSearchParams(gameFilterQuery(filters)).entries()]

  // Chips: cada uno quita un filtro.
  const chips: { label: string; href: string }[] = []
  const without = (patch: Partial<GameListFilters>) => `/admin/games?${gameFilterQuery({ ...filters, ...patch })}`
  if (filters.search) chips.push({ label: `Título: ${filters.search}`, href: without({ search: '' }) })
  if (filters.platform) chips.push({ label: `Plataforma: ${platforms.find(p => p.slug === filters.platform)?.name ?? filters.platform}`, href: without({ platform: '' }) })
  for (const k of filters.missing) chips.push({ label: MISSING_LABEL[k], href: without({ missing: filters.missing.filter(m => m !== k) }) })
  if (filters.minMeta > 0) chips.push({ label: `Metadatos ≥ ${filters.minMeta} %`, href: without({ minMeta: 0 }) })
  if (filters.state) chips.push({ label: STATE_LABEL[filters.state] ?? filters.state, href: without({ state: '' }) })
  if (filters.region) chips.push({ label: `Región: ${filters.region}`, href: without({ region: '' }) })
  if (filters.noScore) chips.push({ label: 'Sin nota', href: without({ noScore: false }) })
  if (filters.noCover) chips.push({ label: 'Sin portada', href: without({ noCover: false }) })
  if (filters.noMeta) chips.push({ label: 'Sin metadatos', href: without({ noMeta: false }) })
  if (filters.unfindable) chips.push({ label: 'No encontrados', href: without({ unfindable: false }) })

  // Panel: se carga aparte, así sigue abierto aunque el juego ya no esté en la lista filtrada.
  const panelGame = Number.isInteger(panelId)
    ? await db.game.findUnique({ where: { id: panelId }, include: { platform: { select: { name: true } } } })
    : null
  const idx = panelGame ? pageRows.findIndex(g => g.id === panelGame.id) : -1
  const prevRow = idx > 0 ? pageRows[idx - 1] : null
  const nextRow = idx >= 0 && idx < pageRows.length - 1 ? pageRows[idx + 1] : null
  const panelData: PanelGame | null = panelGame && {
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
    isHidden: panelGame.isHidden,
    metadataFetchedAt: panelGame.metadataFetchedAt ? panelGame.metadataFetchedAt.toISOString() : null,
  }
  const panelCompleteness = panelGame ? completeness(panelGame) : null
  const panelReturn = panelGame ? `/admin/games?${gameFilterQuery(filters, { page: String(page), panel: String(panelGame.id) })}` : ''

  const input = 'bg-secondary border border-border rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div>
      <ScrollRestorer storageKey={`admin-games:${gameFilterQuery(filters, { page: String(page) })}`} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Juegos</h2>
          <p className="text-sm text-muted-foreground">{total.toLocaleString('es-ES')} juegos{activeFilterCount(filters) ? ` · ${activeFilterCount(filters)} filtros activos` : ''}</p>
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
              Filtros{activeFilterCount(filters) ? ` (${activeFilterCount(filters)})` : ''}
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
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">Estado
                  <select name="estado" defaultValue={filters.state} className={input}>
                    <option value="">Visibles</option>
                    <option value="hidden">Ocultos (cementerio)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">Región
                  <select name="region" defaultValue={filters.region} className={input}>
                    <option value="">Cualquiera</option>
                    {regions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                <Link href="/admin/games" className="text-sm text-violet-300 underline">Quitar todos</Link>
                <button type="submit" className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">Aplicar</button>
              </div>
            </div>
          </details>
          <button type="submit" className="rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-accent">Buscar</button>
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

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th scope="col" className="w-12 px-3 py-3 font-medium"><span className="sr-only">Portada</span></th>
                <th scope="col" className="px-3 py-3 font-medium">Título</th>
                <th scope="col" className="px-3 py-3 font-medium">Plataforma</th>
                <th scope="col" className="px-3 py-3 font-medium">Año</th>
                <th scope="col" className="w-48 px-3 py-3 font-medium">Metadatos</th>
                <th scope="col" className="px-3 py-3 font-medium">Faltan</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Tamaño</th>
                <th scope="col" className="px-3 py-3 font-medium"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">Ningún juego con estos filtros.</td></tr>
              )}
              {pageRows.map(g => {
                const c = completeness(g)
                const cover = resolveCoverPath(g.coverPath) ?? g.coverUrl ?? null
                const selected = panelGame?.id === g.id
                const missingNames = c.missing.map(k => MISSING_LABEL[k]?.replace('Sin ', '') ?? k)
                const bar = c.percent >= 70 ? 'bg-emerald-400' : c.percent >= 40 ? 'bg-amber-400' : 'bg-rose-400'
                return (
                  <tr key={g.id} aria-selected={selected} className={`border-b border-border/50 last:border-0 ${selected ? 'bg-violet-500/10' : 'hover:bg-accent/30'}`}>
                    <td className="px-3 py-2">
                      <div className="flex h-10 w-7 items-center justify-center overflow-hidden rounded bg-secondary">
                        {cover
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                          : <span className="text-[9px] font-bold text-muted-foreground">{g.title.charAt(0).toUpperCase()}</span>}
                      </div>
                    </td>
                    <td className="max-w-xs px-3 py-2"><span className="block truncate font-medium">{g.title}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{g.platform.name}</td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{g.releaseYear ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div role="meter" aria-label={`Metadatos de ${g.title}`} aria-valuenow={c.percent} aria-valuemin={0} aria-valuemax={100} className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                          <span className={`block h-full ${bar}`} style={{ width: `${c.percent}%` }} />
                        </div>
                        <span className="w-10 text-right text-xs tabular-nums">{c.percent} %</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-amber-200">
                      {missingNames.length === 0 ? <span className="text-muted-foreground">—</span> : missingNames.slice(0, 3).join(', ') + (missingNames.length > 3 ? ` +${missingNames.length - 3}` : '')}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{formatBytes(g.fileSize)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link href={rowHref(g.id)} aria-current={selected ? 'true' : undefined} className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-xs hover:bg-accent">
                        <Pencil className="h-3 w-3" /> Editar
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <nav aria-label="Paginación" className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {page > 1 && <Link href={pageHref(page - 1)} className="rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-accent">← Anterior</Link>}
            {pageWindow(page, totalPages).map((p, i) => p === 'gap'
              ? <span key={`g${i}`} aria-hidden="true" className="px-2 text-muted-foreground">…</span>
              : <Link key={p} href={pageHref(p)} aria-current={p === page ? 'page' : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm ${p === page ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent'}`}>{p}</Link>)}
            {page < totalPages && <Link href={pageHref(page + 1)} className="rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-accent">Siguiente →</Link>}
          </div>
          <form method="get" action="/admin/games" className="flex items-center gap-2 text-sm text-muted-foreground">
            {hiddenInputs.filter(([k]) => k !== 'page').map(([k, v]) => <input key={`${k}=${v}`} type="hidden" name={k} value={v} />)}
            <label htmlFor="ir-a" className="text-sm">Ir a</label>
            <input id="ir-a" type="number" name="page" min={1} max={totalPages} defaultValue={page} className={`${input} w-20`} />
            <button type="submit" className="rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-accent">Ir</button>
          </form>
        </nav>
      )}

      {panelData && panelCompleteness && (
        <GamePanel
          game={panelData}
          percent={panelCompleteness.percent}
          missing={panelCompleteness.missing}
          closeHref={listUrl}
          imagesHref={`/admin/games/${panelData.id}?volver=${encodeURIComponent(panelReturn)}#imagenes`}
          prevHref={prevRow ? rowHref(prevRow.id) : null}
          nextHref={nextRow ? rowHref(nextRow.id) : null}
        />
      )}
    </div>
  )
}
