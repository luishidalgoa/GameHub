import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { formatBytes } from '@/lib/utils'
import { Pencil } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: { search?: string; platform?: string; page?: string }
}

export default async function AdminGamesPage({ searchParams }: Props) {
  const t = await getTranslations('AdminGames')
  const search = searchParams.search ?? ''
  const platformSlug = searchParams.platform ?? ''
  const page = parseInt(searchParams.page ?? '1', 10)
  const pageSize = 50

  const where = {
    isHidden: false,
    ...(search && { title: { contains: search } }),
    ...(platformSlug && { platform: { slug: platformSlug } }),
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">{t('title')}</h2>
        <span className="text-sm text-muted-foreground">{t('gamesCount', { n: total })}</span>
      </div>

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
