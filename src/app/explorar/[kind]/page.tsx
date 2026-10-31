import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { COLLECTION_KINDS, COLLECTION_PAGE, enabledPlatformChips, getCollection, getPublisherIndex, type CollectionKind } from '@/lib/home-data'
import { PlatformSelect } from '@/components/home/PlatformSelect'
import { ExploreShell } from '@/components/home/ExploreShell'
import { GridTile } from '@/components/home/GridTile'
import { Masonry } from '@/components/home/Masonry'
import { groupByTitle } from '@/lib/game-groups'
import { PublisherTile } from '@/components/home/PublisherTile'

export const dynamic = 'force-dynamic'

export default async function ExplorePage({ params, searchParams }: {
  params: { kind: string }
  searchParams: { page?: string; platform?: string }
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

  if (!COLLECTION_KINDS.includes(kind as CollectionKind)) notFound()
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1)
  const platform = searchParams.platform ?? ''
  const [{ games, total }, chips] = await Promise.all([
    getCollection(kind as CollectionKind, page, platform || undefined),
    enabledPlatformChips(),
  ])
  const base = `/explorar/${kind}?${platform ? `platform=${platform}&` : ''}`
  const pages = Math.max(1, Math.ceil(total / COLLECTION_PAGE))
  if (page > pages) notFound()

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
      <Masonry>
        {groupByTitle(games).map(g => <GridTile key={g.game.id} group={g} />)}
      </Masonry>
      {pages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-6 text-sm text-white/70">
          {page > 1 && <Link href={`${base}page=${page - 1}`} className="hover:text-white">← {page - 1}</Link>}
          <span className="tabular-nums text-white">{page} / {pages}</span>
          {page < pages && <Link href={`${base}page=${page + 1}`} className="hover:text-white">{page + 1} →</Link>}
        </nav>
      )}
    </ExploreShell>
  )
}
