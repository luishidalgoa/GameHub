import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { isAdminSession } from '@/lib/auth'
import { resolveCoverPath } from '@/lib/s3'
import { GameGrid } from '@/components/platform/GameGrid'

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

  const games = await db.game.findMany({
    where: { platformId: platform.id, isHidden: false },
    orderBy: { sortTitle: 'asc' },
    select: {
      id: true,
      title: true,
      sortTitle: true,
      region: true,
      releaseYear: true,
      genre: true,
      coverPath: true,
      coverUrl: true,
      isFavorite: true,
      isHidden: true,
      platformId: true,
      fileSize: true,
      fileName: true,
      metadataFetchedAt: true,
    },
  })

  const gameCount = platform._count?.games ?? 0
  const resolvedGames = games.map(g => ({ ...g, coverPath: resolveCoverPath(g.coverPath) }))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{platform.name}</h1>
        <p className="text-muted-foreground mt-1">{t('games', { count: gameCount })}</p>
      </div>

<GameGrid
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        games={resolvedGames.map((g) => ({ ...g, fileSize: g.fileSize.toString(), metadataFetchedAt: g.metadataFetchedAt?.toISOString() ?? null })) as any}
        platformSlug={params.slug}
        isAdmin={isAdmin}
        thumbnailWidth={platform.thumbnailWidth}
        thumbnailHeight={platform.thumbnailHeight}
      />
    </div>
  )
}
