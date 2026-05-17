import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { ConsoleGrid } from '@/components/home/ConsoleGrid'
import { RecentStrip } from '@/components/home/RecentStrip'
import { TopDownloads } from '@/components/home/TopDownloads'
import type { TopGame } from '@/components/home/TopDownloads'

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
        platform: { select: { slug: true, name: true } },
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

  const totalGames = platforms.reduce((acc, p) => acc + (p._count?.games ?? 0), 0)

  return (
    <div>
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('subtitle', { platforms: platforms.length, games: totalGames })}
        </p>
      </div>

      {/* Recently added */}
      <RecentStrip games={recentGames} />

      {/* Platform grid */}
      <ConsoleGrid platforms={platforms as any[]} />

      {/* Top downloads — below platforms */}
      <TopDownloads games={topGames} />
    </div>
  )
}
