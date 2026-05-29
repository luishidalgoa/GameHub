import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Download, ExternalLink } from 'lucide-react'
import { db } from '@/lib/db'
import { isAdminSession } from '@/lib/auth'
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

  // Cheap aggregation — just unique region strings, no game data
  const regionRows = await db.game.findMany({
    where:    { platformId: platform.id, isHidden: false, region: { not: null } },
    select:   { region: true },
    distinct: ['region'],
    orderBy:  { region: 'asc' },
  })
  const regions = regionRows.map(r => r.region!).filter(Boolean)

  const totalCount = platform._count?.games ?? 0

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{platform.name}</h1>
          {platform.emulatorUrl && (
            <a
              href={platform.emulatorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary border border-border hover:bg-accent text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4 text-primary" />
              {platform.emulatorName
                ? t('downloadEmulatorNamed', { name: platform.emulatorName })
                : t('downloadEmulator')}
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </a>
          )}
        </div>
        <p className="text-muted-foreground mt-1">{t('games', { count: totalCount })}</p>
      </div>

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
