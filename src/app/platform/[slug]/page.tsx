import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { resolveCoverPath } from '@/lib/s3'
import { isAdminSession } from '@/lib/auth'
import { GameGrid } from '@/components/platform/GameGrid'
import { EmulatorLinks } from '@/components/platform/EmulatorLinks'
import { RecommendedStrip } from '@/components/platform/RecommendedStrip'
import { HiddenGemsStrip } from '@/components/platform/HiddenGemsStrip'
import { comparePopularity, weightedSample, MIN_ADDED, GEM_MAX_ADDED, GEM_MIN_RATING } from '@/lib/metadata/popularity'

export const dynamic = 'force-dynamic'

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props) {
  const platform = await db.platform.findUnique({ where: { slug: params.slug } })
  return { title: platform ? `${platform.name} — GameHub` : 'GameHub' }
}

export default async function PlatformPage({ params }: Props) {
  const [t, isAdmin, platform] = await Promise.all([
    getTranslations('Platform'),
    isAdminSession(),
    db.platform.findUnique({
      where: { slug: params.slug },
      include: { _count: { select: { games: { where: { isHidden: false } } } } },
    }),
  ])

  if (!platform) notFound()

  // Cheap aggregation — just unique region strings, no game data
  const regionRows = await db.game.findMany({
    where:    { platformId: platform.id, isHidden: false, region: { not: null } },
    select:   { region: true },
    distinct: ['region'],
    orderBy:  { region: 'asc' },
  })
  const regions = regionRows.map(r => r.region!).filter(Boolean)

  // Distinct genres on this platform (mirrors the regions query) for the filter.
  const genreRows = await db.game.findMany({
    where:    { platformId: platform.id, isHidden: false, genre: { not: null } },
    select:   { genre: true },
    distinct: ['genre'],
    orderBy:  { genre: 'asc' },
  })
  const genres = genreRows.map(g => g.genre!).filter(Boolean)

  const totalCount = platform._count?.games ?? 0

  // ── Recommended games (objective popularity from RAWG) ──────────────────────
  // Candidate set is pruned by the indexed (platformId, rawgAdded) filter; the
  // weighted score is computed in JS on a small pool and the top N kept.
  const recCandidates = await db.game.findMany({
    where: { platformId: platform.id, isHidden: false, rawgAdded: { gte: MIN_ADDED } },
    select: {
      id: true, title: true, coverPath: true, coverUrl: true, releaseYear: true,
      rawgAdded: true, rawgRating: true, rawgMetacritic: true,
    },
    orderBy: { rawgAdded: 'desc' },
    take: 60,
  })
  // Dynamic: take a quality pool (top ~40 by score) and weighted-sample 15 from
  // it on each render, so the strip rotates between good games instead of always
  // showing the same top 15. (The page is force-dynamic → varies per visit.)
  const recPool = recCandidates.slice().sort(comparePopularity).slice(0, 40)
  const recommended = weightedSample(recPool, 15).map(g => ({
    id: g.id,
    title: g.title,
    cover: resolveCoverPath(g.coverPath) ?? g.coverUrl,
    releaseYear: g.releaseYear,
  }))

  // ── Hidden gems: well-rated but not widely owned ────────────────────────────
  const gemRows = await db.game.findMany({
    where: {
      platformId: platform.id, isHidden: false,
      rawgAdded:  { gte: MIN_ADDED, lt: GEM_MAX_ADDED },
      rawgRating: { gte: GEM_MIN_RATING },
    },
    select: { id: true, title: true, coverPath: true, coverUrl: true, releaseYear: true },
    orderBy: { rawgRating: 'desc' },
    take: 15,
  })
  const hiddenGems = gemRows.map(g => ({
    id: g.id,
    title: g.title,
    cover: resolveCoverPath(g.coverPath) ?? g.coverUrl,
    releaseYear: g.releaseYear,
  }))

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{platform.name}</h1>
          <EmulatorLinks
            raw={platform.emulators}
            label={t('downloadEmulator')}
          />
        </div>
        <p className="text-muted-foreground mt-1">{t('games', { count: totalCount })}</p>
      </div>

      <RecommendedStrip
        games={recommended}
        thumbnailWidth={platform.thumbnailWidth}
        thumbnailHeight={platform.thumbnailHeight}
      />

      <GameGrid
        platformSlug={params.slug}
        isAdmin={isAdmin}
        thumbnailWidth={platform.thumbnailWidth}
        thumbnailHeight={platform.thumbnailHeight}
        totalCount={totalCount}
        regions={regions}
        genres={genres}
      />

      <HiddenGemsStrip
        games={hiddenGems}
        thumbnailWidth={platform.thumbnailWidth}
        thumbnailHeight={platform.thumbnailHeight}
      />
    </div>
  )
}
