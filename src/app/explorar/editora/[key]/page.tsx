import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { enabledPlatformChips, getPublisherGames } from '@/lib/home-data'
import { ExploreShell } from '@/components/home/ExploreShell'
import { GridTile } from '@/components/home/GridTile'
import { Masonry } from '@/components/home/Masonry'
import { PlatformSelect } from '@/components/home/PlatformSelect'
import { groupByTitle } from '@/lib/game-groups'

export const dynamic = 'force-dynamic'

export default async function PublisherPage({ params, searchParams }: {
  params: { key: string }
  searchParams: { platform?: string }
}) {
  const t = await getTranslations('Home')
  const platform = searchParams.platform ?? ''
  const [found, chips] = await Promise.all([
    getPublisherGames(decodeURIComponent(params.key), platform || undefined),
    enabledPlatformChips(),
  ])
  if (!found) notFound()

  return (
    <ExploreShell kicker={t('publishersKicker')} title={found.name}>
      <PlatformSelect
        platforms={chips}
        active={platform}
        base={`/explorar/editora/${params.key}`}
        allLabel={t('allPlatforms')}
      />
      <Masonry>
        {groupByTitle(found.games).map(g => <GridTile key={g.game.id} group={g} />)}
      </Masonry>
    </ExploreShell>
  )
}
