import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { COLLECTION_KINDS, enabledPlatformChips, getPublisherIndex, type CollectionKind } from '@/lib/home-data'
import { PlatformSelect } from '@/components/home/PlatformSelect'
import { ExploreShell } from '@/components/home/ExploreShell'
import { CollectionGrid } from '@/components/home/CollectionGrid'
import { PublisherTile } from '@/components/home/PublisherTile'
import { ConsoleGrid } from '@/components/home/ConsoleGrid'
import { getConsoleShelf } from '@/lib/home-data'
import { consoleModelFor, withOrientation } from '@/lib/consoles'
import { getOrientations } from '@/lib/console-orientation'

export const dynamic = 'force-dynamic'

export default async function ExplorePage({ params, searchParams }: {
  params: { kind: string }
  searchParams: { platform?: string }
}) {
  const t = await getTranslations('Home')
  const kind = params.kind

  if (kind === 'editoras') {
    const publishers = await getPublisherIndex()
    return (
      <ExploreShell kicker={t('publishersKicker')} title={t('publishersTitle')}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {publishers.map(p => (
            <PublisherTile key={p.key} publisher={p} href={`/explorar/editora/${encodeURIComponent(p.key)}`}
                           gamesLabel={t('publisherGames', { count: p.games })} />
          ))}
        </div>
      </ExploreShell>
    )
  }

  if (kind === 'consolas') {
    const [shelf, orientations] = await Promise.all([getConsoleShelf(), getOrientations()])
    const tiles = shelf.platforms.filter(p => p.games > 0).map(p => {
      const base = consoleModelFor(p.modelSlug, shelf.modelFiles[p.modelSlug])
      return {
        slug: p.slug,
        name: p.name,
        games: t('platformGames', { count: p.games }),
        model: base && withOrientation(base, orientations),
        poster: shelf.posterFiles[p.slug] ?? null,
      }
    })
    return (
      <ExploreShell kicker={t('consolesKicker')} title={t('consolesTitle')}>
        <ConsoleGrid tiles={tiles} />
      </ExploreShell>
    )
  }

  if (!COLLECTION_KINDS.includes(kind as CollectionKind)) notFound()
  const platform = searchParams.platform ?? ''
  const chips = await enabledPlatformChips()

  const heading = {
    nuevos:       { kicker: t('kickerNew'),    title: t('recentlyAdded') },
    recomendados: { kicker: t('kickerForYou'), title: t('recommended') },
    descargados:  { kicker: t('kickerTop'),    title: t('topDownloads') },
    amigos:       { kicker: t('kickerFriends'), title: t('friendsTitle') },
    lanzamientos: { kicker: t('kickerReleases'), title: t('releasesTitle') },
  }[kind as CollectionKind]

  return (
    <ExploreShell kicker={heading.kicker} title={heading.title}>
      <PlatformSelect
        platforms={chips}
        active={platform}
        base={`/explorar/${kind}`}
        allLabel={t('allPlatforms')}
      />
      <CollectionGrid source={{ kind: 'collection', name: kind, platform: platform || undefined }} />
    </ExploreShell>
  )
}
