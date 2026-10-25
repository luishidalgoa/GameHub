import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { resolveCoverPath } from '@/lib/s3'
import { formatBytes } from '@/lib/utils'
import { DeleteGameButton, PurgeAllButton, RecoverMetadataButton } from '@/components/admin/GraveyardClient'
import { EmptyState } from '@/components/shared/EmptyState'
import Image from 'next/image'
import { Ghost } from 'lucide-react'
import type { Prisma } from '@prisma/client'
import { SortHeader } from '@/components/admin/SortHeader'
import { nextSort, parseSort, sortParams, type SortState } from '@/lib/admin-sort'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: { search?: string; platform?: string; page?: string; sort?: string; dir?: string }
}

const SORT_KEYS = ['title', 'platform', 'region', 'size', 'lastSeen'] as const
type SortKey = (typeof SORT_KEYS)[number]
const SORT_DEFAULT: SortState<SortKey> = { key: 'lastSeen', dir: 'desc' }

function orderFor(s: SortState<SortKey>): Prisma.GameOrderByWithRelationInput {
  switch (s.key) {
    case 'title': return { sortTitle: s.dir }
    case 'platform': return { platform: { name: s.dir } }
    case 'region': return { region: s.dir }
    case 'size': return { fileSize: s.dir }
    case 'lastSeen': return { lastSeenAt: s.dir }
  }
}

export default async function GraveyardPage({ searchParams }: Props) {
  const t            = await getTranslations('AdminGraveyard')
  const search       = searchParams.search ?? ''
  const platformSlug = searchParams.platform ?? ''
  const page         = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const pageSize     = 50
  const sort         = parseSort<SortKey>(searchParams, SORT_KEYS, SORT_DEFAULT)
  const sortExtra    = sortParams(sort, SORT_DEFAULT)
  const listQuery = (extra: Record<string, string>) => new URLSearchParams({ search, platform: platformSlug, ...sortExtra, ...extra }).toString()

  const where = {
    isHidden: true,
    ...(search       && { title:    { contains: search } }),
    ...(platformSlug && { platform: { slug: platformSlug } }),
  }

  const [games, total, totalMissing, platforms] = await Promise.all([
    db.game.findMany({
      where,
      orderBy: orderFor(sort),
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      include: { platform: { select: { name: true, slug: true } } },
    }),
    db.game.count({ where }),
    db.game.count({ where: { isHidden: true } }),
    db.platform.findMany({ orderBy: { sortOrder: 'asc' } }),
  ])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Ghost className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">{t('title')}</h2>
            {totalMissing > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium">
                {totalMissing}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <RecoverMetadataButton count={totalMissing} />
          <PurgeAllButton count={totalMissing} />
        </div>
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

      {/* Empty state */}
      {totalMissing === 0 ? (
        <EmptyState icon="ghost" title={t('emptyTitle')} description={t('emptySubtitle')} />
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium w-10"></th>
                  <SortHeader label={t('colTitle')} href={`/admin/graveyard?${listQuery({ ...sortParams(nextSort(sort, 'title'), SORT_DEFAULT), page: '1' })}`} active={sort.key === 'title'} dir={sort.dir} />
                  <SortHeader label={t('colPlatform')} href={`/admin/graveyard?${listQuery({ ...sortParams(nextSort(sort, 'platform'), SORT_DEFAULT), page: '1' })}`} active={sort.key === 'platform'} dir={sort.dir} />
                  <SortHeader label={t('colRegion')} href={`/admin/graveyard?${listQuery({ ...sortParams(nextSort(sort, 'region'), SORT_DEFAULT), page: '1' })}`} active={sort.key === 'region'} dir={sort.dir} />
                  <SortHeader label={t('colSize')} href={`/admin/graveyard?${listQuery({ ...sortParams(nextSort(sort, 'size'), SORT_DEFAULT), page: '1' })}`} active={sort.key === 'size'} dir={sort.dir} />
                  <SortHeader label={t('colLastSeen')} href={`/admin/graveyard?${listQuery({ ...sortParams(nextSort(sort, 'lastSeen'), SORT_DEFAULT), page: '1' })}`} active={sort.key === 'lastSeen'} dir={sort.dir} />
                  <th className="px-4 py-3 font-medium max-w-xs">{t('colPath')}</th>
                  <th className="px-4 py-3 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => {
                  const coverSrc = resolveCoverPath(game.coverPath) ?? game.coverUrl ?? null

                  return (
                    <tr
                      key={game.id}
                      className="border-b border-border/50 last:border-0 hover:bg-accent/20 transition-colors"
                    >
                      {/* Mini cover */}
                      <td className="px-4 py-2">
                        <div className="w-7 h-10 rounded overflow-hidden bg-secondary shrink-0 flex items-center justify-center">
                          {coverSrc ? (
                            <Image
                              src={coverSrc}
                              alt=""
                              width={28}
                              height={40}
                              className="object-cover w-full h-full opacity-60"
                              unoptimized
                            />
                          ) : (
                            <span className="text-[8px] text-muted-foreground font-bold">
                              {game.title.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-2 max-w-[200px]">
                        <span className="font-medium truncate block text-muted-foreground">
                          {game.title}
                        </span>
                      </td>

                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                        {game.platform.name}
                      </td>

                      <td className="px-4 py-2 text-muted-foreground">
                        {game.region ?? '—'}
                      </td>

                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                        {formatBytes(game.fileSize)}
                      </td>

                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap text-xs">
                        {game.lastSeenAt.toLocaleDateString(undefined, {
                          year: 'numeric', month: 'short', day: 'numeric',
                        })}
                      </td>

                      <td className="px-4 py-2 max-w-xs">
                        <span
                          title={game.filePath}
                          className="text-xs text-muted-foreground/60 truncate block font-mono"
                        >
                          {game.filePath}
                        </span>
                      </td>

                      <td className="px-4 py-2">
                        <DeleteGameButton id={game.id} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <a
                  key={p}
                  href={`/admin/graveyard?${listQuery({ page: String(p) })}`}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    p === page
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  {p}
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
