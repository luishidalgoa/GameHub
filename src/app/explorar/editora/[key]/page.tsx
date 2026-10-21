import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getPublisherGames } from '@/lib/home-data'
import { ExploreShell } from '@/components/home/ExploreShell'
import { GridTile } from '@/components/home/GridTile'
import { Masonry } from '@/components/home/Masonry'
import { groupByTitle } from '@/lib/game-groups'

export const dynamic = 'force-dynamic'

export default async function PublisherPage({ params }: { params: { key: string } }) {
  const t = await getTranslations('Home')
  const found = await getPublisherGames(decodeURIComponent(params.key))
  if (!found) notFound()

  return (
    <ExploreShell kicker={t('publishersKicker')} title={found.name} backLabel={t('title')}>
      <Masonry>
        {groupByTitle(found.games).map(g => <GridTile key={g.game.id} group={g} />)}
      </Masonry>
    </ExploreShell>
  )
}
