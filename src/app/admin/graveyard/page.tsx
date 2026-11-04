import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { PurgeAllButton, RecoverMetadataButton } from '@/components/admin/GraveyardClient'
import { AdminGameTable } from '@/components/admin/AdminGameTable'
import { AdminButton } from '@/components/admin/AdminButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Ghost } from 'lucide-react'
import { nextSort, parseSort, sortParams } from '@/lib/admin-sort'
import { GRAVEYARD_SORT_DEFAULT, GRAVEYARD_SORT_KEYS, graveyardWhere, type GraveyardSortKey } from '@/lib/games/list'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: { search?: string; platform?: string; sort?: string; dir?: string }
}

export default async function GraveyardPage({ searchParams }: Props) {
  const t            = await getTranslations('AdminGraveyard')
  const search       = searchParams.search ?? ''
  const platformSlug = searchParams.platform ?? ''
  const sort         = parseSort<GraveyardSortKey>(searchParams, GRAVEYARD_SORT_KEYS, GRAVEYARD_SORT_DEFAULT)
  const sortExtra    = sortParams(sort, GRAVEYARD_SORT_DEFAULT)

  // Filters and sort are the table's query; the table pages through them.
  const query = new URLSearchParams({ ...(search && { search }), ...(platformSlug && { platform: platformSlug }), ...sortExtra }).toString()
  const sortHref = (key: GraveyardSortKey) => `/admin/graveyard?${new URLSearchParams({ ...(search && { search }), ...(platformSlug && { platform: platformSlug }), ...sortParams(nextSort(sort, key), GRAVEYARD_SORT_DEFAULT) }).toString()}`
  const sortLinks = Object.fromEntries(GRAVEYARD_SORT_KEYS.map(k => [k, sortHref(k)])) as Record<string, string>

  const [totalMissing, platformList] = await Promise.all([
    db.game.count({ where: await graveyardWhere({ search: '', platform: '' }) }),
    db.platform.findMany({ orderBy: { sortOrder: 'asc' } }),
  ])

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
          {platformList.map((p) => (
            <option key={p.slug} value={p.slug}>{p.name}</option>
          ))}
        </select>
        <AdminButton variant="primary" type="submit">
          {t('filter')}
        </AdminButton>
      </form>

      {totalMissing === 0 ? (
        <EmptyState icon="ghost" title={t('emptyTitle')} description={t('emptySubtitle')} />
      ) : (
        <AdminGameTable variant="graveyard" query={query} sort={{ key: sort.key, dir: sort.dir }} sortLinks={sortLinks} />
      )}
    </div>
  )
}
