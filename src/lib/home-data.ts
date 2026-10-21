import { db } from '@/lib/db'
import { cachedAggregate } from '@/lib/aggregate-cache'
import { libraryGameWhere } from '@/lib/library'
import { resolveCoverPath } from '@/lib/s3'
import { comparePopularity, weightedSample, MIN_ADDED } from '@/lib/metadata/popularity'
import { rankPublishers, type RankedPublisher } from '@/lib/publishers'
import { getPublisherArt, brandColorsFor } from '@/lib/publisher-art'

/** A game as the home page draws it: one wide image, whatever the game has. */
export interface TileGame {
  id: number
  title: string
  platformName: string
  platformSlug: string
  /** 16:9 image for tiles: fanart, else a screenshot. Null when the game has neither. */
  image: string | null
  /** True when `image` is the game's own fanart (a real banner), not a screenshot. */
  fanart: boolean
  /** Image to blur behind the page: the chosen backdrop, else the tile image. */
  backdrop: string | null
  cover: string | null
  logo: string | null
  /** Up to three "#rrggbb" colors from the backdrop, or null before art was fetched. */
  palette: string[] | null
  year: number | null
  genre: string | null
  publisher: string | null
  score: number | null
  description: string | null
}

const TILE_SELECT = {
  id: true, title: true, coverPath: true, coverUrl: true, screenshotPaths: true,
  tilePath: true, backdropPath: true, logoPath: true, themePalette: true,
  releaseYear: true, genre: true, publisher: true, rawgScore: true, description: true,
  platform: { select: { slug: true, name: true } },
} as const

interface TileRow {
  id: number
  title: string
  coverPath: string | null
  coverUrl: string | null
  screenshotPaths: string | null
  tilePath: string | null
  backdropPath: string | null
  logoPath: string | null
  themePalette: string | null
  releaseYear: number | null
  genre: string | null
  publisher: string | null
  rawgScore: number | null
  description: string | null
  platform: { slug: string; name: string }
}

function firstScreenshot(raw: string | null): string | null {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.find((x: unknown): x is string => typeof x === 'string' && x.length > 0) ?? null
  } catch { /* not JSON: ignore */ }
  return null
}

function parsePalette(raw: string | null): string[] | null {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr) && arr.every(x => typeof x === 'string')) return arr.length ? arr : null
  } catch { /* ignore */ }
  return null
}

export function toTile(g: TileRow): TileGame {
  const image = resolveCoverPath(g.tilePath) ?? firstScreenshot(g.screenshotPaths)
  return {
    id: g.id,
    title: g.title,
    platformName: g.platform.name,
    platformSlug: g.platform.slug,
    image,
    fanart: g.tilePath != null,
    backdrop: resolveCoverPath(g.backdropPath) ?? image,
    cover: resolveCoverPath(g.coverPath) ?? g.coverUrl,
    logo: resolveCoverPath(g.logoPath),
    palette: parsePalette(g.themePalette),
    year: g.releaseYear,
    genre: g.genre,
    publisher: g.publisher,
    score: g.rawgScore,
    description: g.description,
  }
}

/** A tile needs an image to be worth a place in a wide rail. */
const WITH_ART = { OR: [{ tilePath: { not: null } }, { screenshotPaths: { not: null } }] }

export const RAIL_SIZE = 18

/** A publisher as its tile draws it. */
export interface PublisherTileData {
  key: string
  name: string
  games: number
  logo: string | null
  /** The logo keeps its own colors instead of being drawn in white. */
  plainLogo: boolean
  character: string | null
  /** Two "#rrggbb" gradient colors. */
  colors: string[]
}

/** Publishers by the weight of their games' ratings. Recomputed at most every 30 minutes. */
export async function rankedPublishers(limit: number, minRated = 3): Promise<RankedPublisher[]> {
  const rows = await cachedAggregate('home:publishers', 30 * 60_000, () => db.game.findMany({
    where: { ...libraryGameWhere(), publisher: { not: null } },
    select: { publisher: true, rawgScore: true },
  }))
  return rankPublishers(rows.map(r => ({ publisher: r.publisher, score: r.rawgScore })), minRated).slice(0, limit)
}

async function publisherTiles(ranked: RankedPublisher[]): Promise<PublisherTileData[]> {
  const art = await getPublisherArt()
  return ranked.map(p => ({
    key: p.key, name: p.name, games: p.games,
    logo: resolveCoverPath(art[p.key]?.logo ?? null),
    plainLogo: art[p.key]?.plain === true,
    character: resolveCoverPath(art[p.key]?.character ?? null),
    colors: brandColorsFor(p.key, art[p.key]?.colors ?? []),
  }))
}

export interface HomeData {
  hero: TileGame[]
  featured: TileGame[]
  recent: TileGame[]
  recommended: TileGame[]
  mostDownloaded: TileGame[]
  publishers: PublisherTileData[]
  platforms: { slug: string; name: string; games: number }[]
  totalGames: number
}

export async function getHomeData(): Promise<HomeData> {
  const where = { ...libraryGameWhere(), ...WITH_ART }

  const [platforms, recentRows, candidates, featuredRows, downloadCounts, topPublishers] = await Promise.all([
    db.platform.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, name: true, _count: { select: { games: { where: { isHidden: false } } } } },
    }),
    db.game.findMany({ where, orderBy: { createdAt: 'desc' }, take: RAIL_SIZE, select: TILE_SELECT }),
    db.game.findMany({
      where: { ...where, rawgAdded: { gte: MIN_ADDED } },
      select: { ...TILE_SELECT, rawgAdded: true, rawgRating: true, rawgMetacritic: true },
      orderBy: { rawgAdded: 'desc' },
      take: 120,
    }),
    db.game.findMany({ where: { ...where, isFeatured: true }, orderBy: { rawgScore: 'desc' }, take: 6, select: TILE_SELECT }),
    // Recomputed at most every 10 minutes: the top downloads change slowly (#92).
    cachedAggregate('home:top-downloads', 10 * 60_000, () => db.downloadLog.groupBy({
      by: ['gameId'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 40,
    })),
    rankedPublishers(10),
  ])

  const ranked = candidates.slice().sort(comparePopularity)
  // Hero: the best-known games that have real art, in a stable order.
  // Without popularity data yet (a fresh library), the newest games stand in.
  const hero = (ranked.length ? ranked : recentRows).slice(0, 5).map(toTile)
  const heroIds = new Set(hero.map(g => g.id))

  // Featured: the owner's picks; when there are fewer than six, the best-rated
  // games not already in the hero fill the wall so it never looks half empty.
  let featured = featuredRows.map(toTile)
  if (featured.length < 6) {
    const taken = new Set([...featured.map(g => g.id), ...heroIds])
    const filler = ranked
      .filter(g => !taken.has(g.id))
      .sort((a, b) => (b.rawgScore ?? 0) - (a.rawgScore ?? 0))
      .slice(0, 6 - featured.length)
      .map(toTile)
    featured = [...featured, ...filler]
  }

  const recommended = weightedSample(ranked.slice(0, 60), RAIL_SIZE).map(toTile)

  const dlIds = downloadCounts.map(d => d.gameId)
  const dlRows = dlIds.length
    ? await db.game.findMany({ where: { id: { in: dlIds }, ...where }, select: TILE_SELECT })
    : []
  const rank = new Map(dlIds.map((id, i) => [id, i]))
  const mostDownloaded = dlRows.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!).slice(0, RAIL_SIZE).map(toTile)

  return {
    hero, featured, recent: recentRows.map(toTile), recommended, mostDownloaded,
    publishers: await publisherTiles(topPublishers),
    platforms: platforms.map(p => ({ slug: p.slug, name: p.name, games: p._count.games })),
    totalGames: platforms.reduce((n, p) => n + p._count.games, 0),
  }
}

// ── "Show all" collections ─────────────────────────────────────────────────

export const COLLECTION_PAGE = 48
export type CollectionKind = 'nuevos' | 'recomendados' | 'descargados'
export const COLLECTION_KINDS: CollectionKind[] = ['nuevos', 'recomendados', 'descargados']

export interface Collection { games: TileGame[]; total: number }

/** One page of a collection behind a rail's "show all" tile. Unlike the rails,
 *  it includes games without art: their tiles fall back to the box art. */
export async function getCollection(kind: CollectionKind, page: number): Promise<Collection> {
  const where = libraryGameWhere()
  const skip = (Math.max(1, page) - 1) * COLLECTION_PAGE

  if (kind === 'nuevos') {
    const [rows, total] = await Promise.all([
      db.game.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: COLLECTION_PAGE, select: TILE_SELECT }),
      db.game.count({ where }),
    ])
    return { games: rows.map(toTile), total }
  }

  if (kind === 'recomendados') {
    const popular = { ...where, rawgAdded: { gte: MIN_ADDED } }
    const [rows, total] = await Promise.all([
      db.game.findMany({
        where: popular, orderBy: [{ rawgAdded: 'desc' }, { id: 'asc' }], skip, take: COLLECTION_PAGE, select: TILE_SELECT,
      }),
      db.game.count({ where: popular }),
    ])
    return { games: rows.map(toTile), total }
  }

  const counts = await cachedAggregate('collection:downloads', 10 * 60_000, () => db.downloadLog.groupBy({
    by: ['gameId'], _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 500,
  }))
  const ids = counts.map(c => c.gameId)
  const rows = await db.game.findMany({ where: { ...where, id: { in: ids } }, select: TILE_SELECT })
  const rank = new Map(ids.map((id, i) => [id, i]))
  const ordered = rows.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  return { games: ordered.slice(skip, skip + COLLECTION_PAGE).map(toTile), total: ordered.length }
}

/** Every publisher with enough rated games, with the art of its tile. */
export async function getPublisherIndex(limit = 60): Promise<PublisherTileData[]> {
  return publisherTiles(await rankedPublishers(limit))
}

/** The games of one publisher, by the key the rankings use, best rated first. */
export async function getPublisherGames(key: string): Promise<{ name: string; games: TileGame[] } | null> {
  const rows = await db.game.findMany({
    where: { ...libraryGameWhere(), publisher: { not: null } },
    select: { publisher: true, rawgScore: true },
  })
  const ranked = rankPublishers(rows.map(r => ({ publisher: r.publisher, score: r.rawgScore })), 0)
  const found = ranked.find(p => p.key === key)
  if (!found) return null
  const games = await db.game.findMany({
    where: { ...libraryGameWhere(), publisher: { in: found.spellings } },
    orderBy: [{ rawgScore: 'desc' }, { title: 'asc' }], take: 300, select: TILE_SELECT,
  })
  return { name: found.name, games: games.map(toTile) }
}
