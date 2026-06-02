import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { resolveCoverPath } from '@/lib/s3'
import { ConsoleGrid } from '@/components/home/ConsoleGrid'
import { RecentStrip } from '@/components/home/RecentStrip'
import { TopDownloads } from '@/components/home/TopDownloads'
import { GlobalRecommendedStrip, type GlobalRecGame } from '@/components/home/GlobalRecommendedStrip'
import { Hero, type HeroGame } from '@/components/home/Hero'
import { SurpriseButton } from '@/components/home/SurpriseButton'
import { comparePopularity, weightedSample, MIN_ADDED } from '@/lib/metadata/popularity'
import type { TopGame } from '@/components/home/TopDownloads'

/** First valid screenshot URL stored on a game, or null. */
function firstScreenshot(raw: string | null): string | null {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) {
      const s = arr.find((x: unknown): x is string => typeof x === 'string' && x.length > 0)
      return s ?? null
    }
  } catch { /* ignore */ }
  return null
}

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [t, platforms, recentGames, downloadCounts] = await Promise.all([
    getTranslations('Home'),
    db.platform.findMany({
      where:   { enabled: true },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { games: { where: { isHidden: false } } } } },
    }),
    db.game.findMany({
      where:   { isHidden: false },
      orderBy: { createdAt: 'desc' },
      take:    16,
      select: {
        id: true, title: true, coverPath: true, coverUrl: true, releaseYear: true,
        platform: { select: { slug: true, name: true, thumbnailWidth: true, thumbnailHeight: true } },
      },
    }),
    db.downloadLog.groupBy({
      by:      ['gameId'],
      _count:  { id: true },
      orderBy: { _count: { id: 'desc' } },
      take:    100,
    }),
  ])

  // ── Build flat top-downloads list ─────────────────────────────────────────
  let topGames: TopGame[] = []

  if (downloadCounts.length > 0) {
    const topGameIds  = downloadCounts.map((d) => d.gameId)
    const gamesForTop = await db.game.findMany({
      where:  { id: { in: topGameIds }, isHidden: false },
      select: { id: true, title: true, platform: { select: { slug: true, name: true } } },
    })

    const countMap = new Map(downloadCounts.map((d) => [d.gameId, d._count.id]))
    topGames = gamesForTop
      .map((g) => ({
        id:           g.id,
        title:        g.title,
        downloads:    countMap.get(g.id) ?? 0,
        platformName: g.platform.name,
        platformSlug: g.platform.slug,
      }))
      .sort((a, z) => z.downloads - a.downloads)
      .slice(0, 15)
  }

  const resolvedRecent = recentGames.map(g => ({ ...g, coverPath: resolveCoverPath(g.coverPath) }))

  const totalGames = platforms.reduce((acc, p) => acc + (p._count?.games ?? 0), 0)

  // ── Global recommendations (cross-platform popularity) + hero ───────────────
  const recCandidates = await db.game.findMany({
    where: { isHidden: false, rawgAdded: { gte: MIN_ADDED } },
    select: {
      id: true, title: true, coverPath: true, coverUrl: true, screenshotPaths: true,
      rawgAdded: true, rawgRating: true, rawgMetacritic: true, rawgScore: true,
      platform: { select: { name: true, thumbnailWidth: true, thumbnailHeight: true } },
    },
    orderBy: { rawgAdded: 'desc' },
    take: 80,
  })
  const ranked = recCandidates.slice().sort(comparePopularity)

  // Dynamic: weighted-sample 12 from the top ~40 quality pool so the home strip
  // rotates between good games each visit (the hero stays the stable #1 below).
  const globalRecommended: GlobalRecGame[] = weightedSample(ranked.slice(0, 40), 12).map(g => ({
    id: g.id,
    title: g.title,
    cover: resolveCoverPath(g.coverPath) ?? g.coverUrl,
    platformName: g.platform.name,
    thumbnailWidth:  g.platform.thumbnailWidth,
    thumbnailHeight: g.platform.thumbnailHeight,
  }))

  // Hero: the top game, preferring one with a screenshot for the backdrop.
  const heroSource = ranked.find(g => firstScreenshot(g.screenshotPaths)) ?? ranked[0] ?? null
  const heroGame: HeroGame | null = heroSource ? {
    id: heroSource.id,
    title: heroSource.title,
    platformName: heroSource.platform.name,
    background: firstScreenshot(heroSource.screenshotPaths) ?? resolveCoverPath(heroSource.coverPath) ?? heroSource.coverUrl,
    cover: resolveCoverPath(heroSource.coverPath) ?? heroSource.coverUrl,
    rawgScore: heroSource.rawgScore,
    rawgRating: heroSource.rawgRating,
    rawgMetacritic: heroSource.rawgMetacritic,
  } : null

  return (
    <div>
      {/* Featured hero (renders nothing without popularity data) */}
      <Hero game={heroGame} />

      {/* Header */}
      <div className="mb-6 sm:mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('subtitle', { platforms: platforms.length, games: totalGames })}
          </p>
        </div>
        <SurpriseButton />
      </div>

      {/* Recently added */}
      <RecentStrip games={resolvedRecent} />

      {/* Recommended (cross-platform popularity) */}
      <GlobalRecommendedStrip games={globalRecommended} />

      {/* Platform grid */}
      <ConsoleGrid platforms={platforms as any[]} />

      {/* Top downloads — below platforms */}
      <TopDownloads games={topGames} />
    </div>
  )
}
