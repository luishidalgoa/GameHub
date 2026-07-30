import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { formatBytes } from '@/lib/utils'
import { Pencil, FileJson, FileSpreadsheet } from 'lucide-react'
import { ScrollRestorer } from '@/components/admin/ScrollRestorer'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: {
    search?: string; platform?: string; page?: string
    /** Dashboard cards link here with one of these set. */
    score?: string; cover?: string; meta?: string
  }
}

export default async function AdminGamesPage({ searchParams }: Props) {
  const t = await getTranslations('AdminGames')
  const search = searchParams.search ?? ''
  const platformSlug = searchParams.platform ?? ''
  const noScore = searchParams.score === 'no-score'
  const noCover = searchParams.cover === 'no-cover'
  const noMeta  = searchParams.meta  === 'no-metadata'
  const page = parseInt(searchParams.page ?? '1', 10)
  const pageSize = 50

  const where = {
    isHidden: false,
    ...(search && { title: { contains: search } }),
    ...(platformSlug && { platform: { slug: platformSlug } }),
    ...(noScore && { rawgScore: null }),
    // "Sin portada" means neither a stored file nor a remote URL — the same test
    // the dashboard counts with, so the card's number and this list agree.
    ...(noCover && { coverPath: null, coverUrl: null }),
    ...(noMeta  && { metadataFetchedAt: null }),
  }

  const [games, total, platforms] = await Promise.all([
    db.game.findMany({
      where,
      orderBy: { sortTitle: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { platform: { select: { name: true, slug: true } } },
    }),
    db.game.count({ where }),
    db.platform.findMany({ orderBy: { sortOrder: 'asc' } }),
  ])

  const totalPages = Math.ceil(total / pageSize)

  // Export links honour the active filters: pick a platform → only that one;
  // "All Platforms" → everything (the platform column is always included).
  const exportParams = new URLSearchParams()
  if (platformSlug) exportParams.set('platform', platformSlug)
  if (search) exportParams.set('search', search)
  if (noScore) exportParams.set('noScore', '1')
  if (noCover) exportParams.set('noCover', '1')
  if (noMeta)  exportParams.set('noMeta', '1')
  const exportQs = exportParams.toString()
  const exportHref = (format: 'json' | 'csv') =>
    `/api/admin/games/export?format=${format}${exportQs ? `&${exportQs}` : ''}`

  return (
    <div>
      {/* Restore scroll position when returning from a game editor */}
      <ScrollRestorer storageKey={`admin-games:${search}:${platformSlug}:${page}`} />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-xl font-semibold">{t('title')}</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{t('gamesCount', { n: total })}</span>
          <a
            href={exportHref('json')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-secondary hover:bg-accent transition-colors"
          >
            <FileJson className="w-4 h-4" />
            {t('exportJson')}
          </a>
          <a
            href={exportHref('csv')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-secondary hover:bg-accent transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {t('exportCsv')}
          </a>
        </div>
      </div>

      {/* Chip for whichever dashboard card sent us here. Colours match the card
          that links to each one, so the jump is obvious. */}
      {(noScore || noCover || noMeta) && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
            noScore ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
            : noCover ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            : 'bg-violet-500/15 text-violet-300 border-violet-500/30'
          }`}>
            {noScore ? t('filterNoScore') : noCover ? t('filterNoCover') : t('filterNoMetadata')}
          </span>
          <Link href="/admin/games" className="text-xs text-muted-foreground hover:text-foreground underline">
            {t('clearFilter')}
          </Link>
        </div>
      )}

      {/* Filters */}
      <form className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder={t('searchPlaceholder')}
          className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-48"
        />
        <select
          name="platform"
          defaultValue={platformSlug}
          className="bg-secondary border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{t('allPlatforms')}</option>
          {platforms.map((p) => (
            <option key={p.slug} value={p.slug}>{p.name}</option>
          ))}
        </select>
        <button
          type="submit"
          className="px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {t('filter')}
        </button>
      </form>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('colTitle')}</th>
              <th className="px-4 py-3 font-medium">{t('colPlatform')}</th>
              <th className="px-4 py-3 font-medium">{t('colRegion')}</th>
              <th className="px-4 py-3 font-medium">{t('colYear')}</th>
              <th className="px-4 py-3 font-medium">{t('colSize')}</th>
              <th className="px-4 py-3 font-medium">{t('colCover')}</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr key={game.id} className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors">
                <td className="px-4 py-2.5 max-w-xs">
                  <span className="font-medium truncate block">{game.title}</span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{game.platform.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{game.region ?? '—'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{game.releaseYear ?? '—'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{formatBytes(game.fileSize)}</td>
                <td className="px-4 py-2.5">
                  {game.coverPath || game.coverUrl
                    ? <span className="text-green-500 text-xs">✓</span>
                    : <span className="text-amber-500 text-xs">—</span>}
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/games/${game.id}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-secondary hover:bg-accent transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    {t('edit')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/games?search=${search}&platform=${platformSlug}&page=${p}`}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                p === page
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
