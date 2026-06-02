import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { resolveCoverPath } from '@/lib/s3'
import { isAdminSession } from '@/lib/auth'
import { GameGrid } from '@/components/platform/GameGrid'
import { EmulatorLinks } from '@/components/platform/EmulatorLinks'
import { RecommendedStrip } from '@/components/platform/RecommendedStrip'
import { comparePopularity, MIN_ADDED } from '@/lib/metadata/popularity'

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
  const recommended = recCandidates
    .slice()
    .sort(comparePopularity)
    .slice(0, 15)
    .map(g => ({
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
      />
    </div>
  )
}
