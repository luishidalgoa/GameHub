import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getPublisherGames } from '@/lib/home-data'
import { ExploreShell } from '@/components/home/ExploreShell'
import { GameTile } from '@/components/home/GameTile'

export const dynamic = 'force-dynamic'

export default async function PublisherPage({ params }: { params: { key: string } }) {
  const t = await getTranslations('Home')
  const found = await getPublisherGames(decodeURIComponent(params.key))
  if (!found) notFound()

  return (
    <ExploreShell kicker={t('publishersKicker')} title={found.name} backLabel={t('title')}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {found.games.map(g => <GameTile key={g.id} game={g} />)}
      </div>
    </ExploreShell>
  )
}
