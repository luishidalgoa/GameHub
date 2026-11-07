import { db } from '@/lib/db'
import { cachedAggregate } from '@/lib/aggregate-cache'
import {
  DEFAULT_ART_FILTER, hasRichMetadata, isValuableForArt, selectArtGames,
  type ArtCandidate, type ArtFilter, type ArtMissing, type ArtView,
} from '@/lib/art-value'

// The art page's list: the games still missing a background or a logo, for the filter
// the reader picked. The candidates are read once per short window and shared by the
// counters, the chips and every page of the list, so scrolling costs a slice.

const VIEWS: ArtView[] = ['valiosos', 'todos', 'pobres']
const MISSING: ArtMissing[] = ['ambos', 'fondo', 'logo']
export const ART_PAGE_SIZE = 60
const CANDIDATES_TTL_MS = 20_000

/** A platform's boxes: its own size and its official alternate, when it has one. */
export interface PlatformBox { width: number; height: number; altWidth: number | null; altHeight: number | null }

export interface ArtListRow {
  id: number
  title: string
  platform: string
  missing: 'fanart' | 'logo'
  /** The platform's box, so the side panel draws the covers in the console's shape. */
  box: PlatformBox
}

/** The art filter from a query string; anything unknown falls back to the default. */
export function artFilterFrom(sp: Record<string, string | string[] | undefined>): ArtFilter {
  const pick = <T extends string>(v: string | string[] | undefined, allowed: readonly T[], fallback: T): T =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
  return {
    vista: pick(sp.vista, VIEWS, DEFAULT_ART_FILTER.vista),
    falta: pick(sp.falta, MISSING, DEFAULT_ART_FILTER.falta),
    plataforma: typeof sp.plataforma === 'string' && sp.plataforma ? sp.plataforma : 'todas',
  }
}

interface Candidates {
  games: (ArtCandidate & { title: string; platformBox: PlatformBox })[]
  downloaded: Set<number>
}

/** Every visible game with what the art rules read, and which games were downloaded here. */
async function candidates(): Promise<Candidates> {
  return cachedAggregate('admin-art:candidates', CANDIDATES_TTL_MS, async () => {
    const [games, downloads] = await Promise.all([
      db.game.findMany({
        where: { isHidden: false },
        select: {
          id: true, title: true, description: true, releaseYear: true, developer: true, genre: true,
          rawgAdded: true, backdropPath: true, logoPath: true,
          platform: { select: { name: true, thumbnailWidth: true, thumbnailHeight: true, altThumbnailWidth: true, altThumbnailHeight: true } },
        },
        orderBy: { title: 'asc' },
      }),
      db.downloadLog.findMany({ distinct: ['gameId'], select: { gameId: true } }),
    ])
    return {
      games: games.map(g => ({
        ...g,
        platformName: g.platform.name,
        platformBox: {
          width: g.platform.thumbnailWidth,
          height: g.platform.thumbnailHeight,
          altWidth: g.platform.altThumbnailWidth,
          altHeight: g.platform.altThumbnailHeight,
        },
      })),
      downloaded: new Set(downloads.map(d => d.gameId)),
    }
  })
}

/** The selected games for a filter, in the order the list shows them. Cached with the candidates. */
async function selection(filter: ArtFilter): Promise<{ games: Candidates['games']; picked: ReturnType<typeof selectArtGames> }> {
  const { games, downloaded } = await candidates()
  const picked = await cachedAggregate(`admin-art:selection:${JSON.stringify(filter)}`, CANDIDATES_TTL_MS, async () =>
    selectArtGames(games, filter, downloaded))
  return { games, picked }
}

/** One page of the art list, for the infinite list on /admin/arte. `page` is 1-based. */
export async function artListPage(filter: ArtFilter, page: number, pageSize = ART_PAGE_SIZE): Promise<{ items: ArtListRow[]; total: number; page: number; hasMore: boolean }> {
  const { games, picked } = await selection(filter)
  const byId = new Map(games.map(g => [g.id, g]))
  const start = (Math.max(1, page) - 1) * pageSize
  const items = picked.slice(start, start + pageSize).flatMap(({ id, missing }) => {
    const g = byId.get(id)
    return g ? [{ id, title: g.title, platform: g.platformName, missing, box: g.platformBox }] : []
  })
  return { items, total: picked.length, page, hasMore: start + pageSize < picked.length }
}

/** The numbers the art page shows above the list: how many each view and each «falta» holds. */
export async function artSummary(filter: ArtFilter): Promise<{
  visible: number
  views: Record<ArtView, number>
  chips: Record<ArtMissing, number>
  selected: number
}> {
  const { games, downloaded } = await candidates()
  const views = Object.fromEntries(VIEWS.map(view => [view, games.filter(g => {
    if (view === 'valiosos') return isValuableForArt(g, downloaded.has(g.id))
    if (view === 'pobres') return !hasRichMetadata(g)
    return true
  }).length])) as Record<ArtView, number>
  const chips = Object.fromEntries(MISSING.map(falta => [falta, selectArtGames(games, { ...filter, falta }, downloaded).length])) as Record<ArtMissing, number>
  return { visible: games.length, views, chips, selected: (await selection(filter)).picked.length }
}
