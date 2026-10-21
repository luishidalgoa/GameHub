import { getTranslations } from 'next-intl/server'
import { getHomeData } from '@/lib/home-data'
import { HomeStage } from '@/components/home/HomeStage'
import { HeroStage } from '@/components/home/HeroStage'
import { WideRail } from '@/components/home/WideRail'
import { GameTile } from '@/components/home/GameTile'
import { FeaturedWall } from '@/components/home/FeaturedWall'
import { PlatformShowcase } from '@/components/home/PlatformShowcase'
import { PublisherTile } from '@/components/home/PublisherTile'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [t, data] = await Promise.all([getTranslations('Home'), getHomeData()])

  if (data.totalGames === 0) {
    return (
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle', { platforms: data.platforms.length, games: 0 })}</p>
      </div>
    )
  }

  const rail = { moreLabel: t('showAll'), moreHint: t('showAllHint') }

  return (
    <HomeStage>
      <HeroStage games={data.hero} labels={{ featured: t('featured'), view: t('featuredView') }} />

      <div className="-mx-4 space-y-16 pb-16 pt-10 sm:-mx-6 sm:space-y-24 sm:pt-14">
        {data.recommended.length > 0 && (
          <WideRail kicker={t('kickerForYou')} title={t('recommended')} href="/explorar/recomendados" {...rail}>
            {data.recommended.map((g, i) => <GameTile key={g.id} game={g} priority={i < 3} />)}
          </WideRail>
        )}

        <FeaturedWall games={data.featured} kicker={t('featuredKicker')} title={t('featuredTitle')} cta={t('featuredView')} />

        {data.recent.length > 0 && (
          <WideRail kicker={t('kickerNew')} title={t('recentlyAdded')} href="/explorar/nuevos" {...rail}>
            {data.recent.map(g => <GameTile key={g.id} game={g} />)}
          </WideRail>
        )}

        <PlatformShowcase
          platforms={data.platforms}
          kicker={t('consolesKicker')}
          title={t('consolesTitle')}
          countLabel={n => t('platformGames', { count: n })}
        />

        {data.publishers.length > 0 && (
          <WideRail kicker={t('publishersKicker')} title={t('publishersTitle')} href="/explorar/editoras" {...rail}>
            {data.publishers.map(p => (
              <PublisherTile key={p.key} name={p.name} href={`/explorar/editora/${encodeURIComponent(p.key)}`}
                             games={p.games} gamesLabel={t('publisherGames', { count: p.games })} samples={p.samples} />
            ))}
          </WideRail>
        )}

        {data.mostDownloaded.length > 0 && (
          <WideRail kicker={t('kickerTop')} title={t('topDownloads')} href="/explorar/descargados" {...rail}>
            {data.mostDownloaded.map(g => <GameTile key={g.id} game={g} />)}
          </WideRail>
        )}
      </div>
    </HomeStage>
  )
}
