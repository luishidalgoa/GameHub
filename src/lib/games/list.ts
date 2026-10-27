import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { cachedAggregate } from '@/lib/aggregate-cache'
import { gameListWhere, filterByCompleteness, type GameListFilters } from '@/lib/games/filters'
import { completeness, type FieldKey } from '@/lib/games/completeness'
import { platformBoxes } from '@/lib/games/platform-boxes'
import { onlineGameIds } from '@/lib/online/flags'
import { resolveCoverPath } from '@/lib/s3'
import { sortRows, type SortDir, type SortState } from '@/lib/admin-sort'

// One list for the library and for the graveyard. Filters and sort go to the
// database whenever the database can decide the order: only the completeness
// filters (a weighted sum over fields) and the online flag are computed here,
// and only over the ids, which are cached for a short while so that the next
// page of an infinite list costs a slice, not another full pass.

export const LIBRARY_SORT_KEYS = ['title', 'platform', 'year', 'featured', 'meta', 'missing', 'size', 'region'] as const
export const GRAVEYARD_SORT_KEYS = ['title', 'platform', 'region', 'size', 'lastSeen'] as const
export type LibrarySortKey = (typeof LIBRARY_SORT_KEYS)[number]
export type GraveyardSortKey = (typeof GRAVEYARD_SORT_KEYS)[number]
export type ListSortKey = LibrarySortKey | GraveyardSortKey

export const LIBRARY_SORT_DEFAULT: SortState<LibrarySortKey> = { key: 'title', dir: 'asc' }
export const GRAVEYARD_SORT_DEFAULT: SortState<GraveyardSortKey> = { key: 'lastSeen', dir: 'desc' }

export type ListScope = 'library' | 'graveyard'

export const PAGE_SIZE_DEFAULT = 50
const PAGE_SIZE_MAX = 100
const IDS_TTL_MS = 20_000

/** One row of the admin tables: what the list shows, and nothing it does not. */
export interface AdminGameRow {
  id: number
  title: string
  platformName: string
  releaseYear: number | null
  isFeatured: boolean
  featuredOrder: number | null
  region: string | null
  /** Bytes; a number is safe for any file size this app sees. */
  fileSize: number
  lastSeenAt: string
  filePath: string
  isHidden: boolean
  coverSrc: string | null
  percent: number
  missing: FieldKey[]
}

export interface AdminListPage {
  items: AdminGameRow[]
  total: number
  page: number
  hasMore: boolean
}

// Everything the row shows, and everything completeness() reads. No description text:
// the list only needs to know whether there is one.
const ROW_SELECT = {
  id: true,
  title: true,
  sortTitle: true,
  titleId: true,
  platformId: true,
  releaseYear: true,
  isFeatured: true,
  featuredOrder: true,
  region: true,
  fileSize: true,
  lastSeenAt: true,
  filePath: true,
  isHidden: true,
  coverPath: true,
  coverUrl: true,
  description: true,
  rawgScore: true,
  genre: true,
  developer: true,
  publisher: true,
  screenshotPaths: true,
  trailerUrl: true,
  platform: { select: { name: true, slug: true } },
} satisfies Prisma.GameSelect

type RowRecord = Prisma.GameGetPayload<{ select: typeof ROW_SELECT }>

/** The graveyard: hidden games, filtered by title and platform only (as it always was). */
export function graveyardWhere(f: Pick<GameListFilters, 'search' | 'platform'>): Prisma.GameWhereInput {
  return {
    isHidden: true,
    ...(f.search && { title: { contains: f.search } }),
    ...(f.platform && { platform: { slug: f.platform } }),
  }
}

/** The database order for a sort key. Nullable columns go last whatever the direction. */
export function dbOrder(key: ListSortKey, dir: SortDir): Prisma.GameOrderByWithRelationInput[] {
  const tie = { id: 'asc' as const }
  switch (key) {
    case 'title': return [{ sortTitle: { sort: dir, nulls: 'last' } }, tie]
    case 'platform': return [{ platform: { name: dir } }, tie]
    case 'year': return [{ releaseYear: { sort: dir, nulls: 'last' } }, tie]
    case 'featured': return [{ isFeatured: dir }, tie]
    case 'size': return [{ fileSize: dir }, tie]
    case 'region': return [{ region: { sort: dir, nulls: 'last' } }, tie]
    case 'lastSeen': return [{ lastSeenAt: dir }, tie]
    // The completeness keys are not columns: they are sorted in memory (see below).
    case 'meta':
    case 'missing':
      return [tie]
  }
}

/** Sort keys the database cannot order: a weighted sum, or a count of missing fields. */
function needsCompleteness(filters: GameListFilters, key: ListSortKey, scope: ListScope): boolean {
  if (scope === 'graveyard') return false
  return filters.missing.length > 0 || filters.minMeta > 0 || filters.online || key === 'meta' || key === 'missing'
}

function sortValue(g: RowRecord, key: ListSortKey): string | number | null {
  const c = completeness(g)
  switch (key) {
    case 'title': return g.sortTitle ?? g.title
    case 'platform': return g.platform.name
    case 'year': return g.releaseYear
    case 'featured': return g.isFeatured ? 1 : 0
    case 'meta': return c.percent
    case 'missing': return c.missing.length
    case 'size': return Number(g.fileSize)
    case 'region': return g.region
    case 'lastSeen': return g.lastSeenAt.getTime()
  }
}

function toRow(g: RowRecord): AdminGameRow {
  const c = completeness(g)
  return {
    id: g.id,
    title: g.title,
    platformName: g.platform.name,
    releaseYear: g.releaseYear,
    isFeatured: g.isFeatured,
    featuredOrder: g.featuredOrder,
    region: g.region,
    fileSize: Number(g.fileSize),
    lastSeenAt: g.lastSeenAt.toISOString(),
    filePath: g.filePath,
    isHidden: g.isHidden,
    coverSrc: resolveCoverPath(g.coverPath) ?? g.coverUrl ?? null,
    percent: c.percent,
    missing: c.missing,
  }
}

/** The ordered ids of a completeness-sorted list, cached per query for a short while. */
async function orderedIds(scope: ListScope, filters: GameListFilters, sort: SortState<ListSortKey>): Promise<number[]> {
  const boxes = scope === 'library' && filters.noBox ? await platformBoxes() : []
  const where = scope === 'graveyard' ? graveyardWhere(filters) : gameListWhere(filters, boxes)
  const key = `admin-list:${scope}:${JSON.stringify({ filters, sort })}`
  return cachedAggregate(key, IDS_TTL_MS, async () => {
    let rows = await db.game.findMany({ where, select: ROW_SELECT })
    if (filters.online) {
      const online = await onlineGameIds(rows)
      rows = rows.filter(g => online.has(g.id))
    }
    rows = filterByCompleteness(rows, filters)
    return sortRows(rows, sort, sortValue).map(g => g.id)
  })
}

/**
 * One page of an admin game list. `page` is 1-based. `hasMore` says whether the next
 * page has rows, so an infinite list knows when to stop without a second request.
 */
export async function listAdminGames(opts: {
  scope: ListScope
  filters: GameListFilters
  sort: SortState<ListSortKey>
  page: number
  pageSize?: number
}): Promise<AdminListPage> {
  const { scope, filters, sort } = opts
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, opts.pageSize ?? PAGE_SIZE_DEFAULT))
  const page = Math.max(1, opts.page)
  const skip = (page - 1) * pageSize

  if (needsCompleteness(filters, sort.key, scope)) {
    const ids = await orderedIds(scope, filters, sort)
    const slice = ids.slice(skip, skip + pageSize)
    const byId = new Map<number, RowRecord>()
    if (slice.length > 0) {
      const rows = await db.game.findMany({ where: { id: { in: slice } }, select: ROW_SELECT })
      for (const r of rows) byId.set(r.id, r)
    }
    const items = slice.flatMap(id => (byId.has(id) ? [toRow(byId.get(id)!)] : []))
    return { items, total: ids.length, page, hasMore: skip + pageSize < ids.length }
  }

  const boxes = scope === 'library' && filters.noBox ? await platformBoxes() : []
  const where = scope === 'graveyard' ? graveyardWhere(filters) : gameListWhere(filters, boxes)
  const [rows, total] = await Promise.all([
    db.game.findMany({
      where,
      orderBy: dbOrder(sort.key, sort.dir),
      skip,
      take: pageSize,
      select: ROW_SELECT,
    }),
    db.game.count({ where }),
  ])
  return { items: rows.map(toRow), total, page, hasMore: skip + pageSize < total }
}
