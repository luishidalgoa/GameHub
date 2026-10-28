import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ExploreShell } from '@/components/home/ExploreShell'
import { GridTile } from '@/components/home/GridTile'
import { Masonry } from '@/components/home/Masonry'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { groupByTitle } from '@/lib/game-groups'
import { COLLECTION_PAGE, searchGames, searchPlatforms } from '@/lib/home-data'
import { searchTerm } from '@/lib/search'

export const dynamic = 'force-dynamic'

/** The full results of the search box: the platforms it names, then every game whose title has the term. */
export default async function SearchPage({ searchParams }: {
  searchParams: { q?: string; page?: string }
}) {
  const t = await getTranslations('Home')
  const term = searchTerm(searchParams.q)
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1)

  const [{ games, total }, platforms] = term
    ? await Promise.all([searchGames(term, page), searchPlatforms(term)])
    : [{ games: [], total: 0 }, []]
  const pages = Math.max(1, Math.ceil(total / COLLECTION_PAGE))
  const pageHref = (n: number) => `/buscar?q=${encodeURIComponent(term)}&page=${n}`

  return (
    <ExploreShell
      kicker={t('searchKicker')}
      title={term ? t('searchTitle', { term }) : t('searchEmpty')}
      backLabel={t('title')}
    >
      {platforms.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">{t('searchPlatforms')}</h2>
          <div className="flex flex-wrap gap-2">
            {platforms.map(p => (
              <Link key={p.slug} href={`/platform/${p.slug}`}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-sm backdrop-blur-xl transition hover:border-white/25 hover:bg-white/[0.1]">
                <PlatformIcon slug={p.slug} iconPath={p.iconPath} size={16} />
                {p.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {term && total === 0 && (
        <p className="text-sm text-white/55">{t('searchNoResults', { term })}</p>
      )}

      {total > 0 && (
        <>
          <Masonry>
            {groupByTitle(games).map(g => <GridTile key={g.game.id} group={g} />)}
          </Masonry>
          {pages > 1 && (
            <nav className="mt-10 flex items-center justify-center gap-6 text-sm text-white/70">
              {page > 1 && <Link href={pageHref(page - 1)} className="hover:text-white">← {page - 1}</Link>}
              <span className="tabular-nums text-white">{page} / {pages}</span>
              {page < pages && <Link href={pageHref(page + 1)} className="hover:text-white">{page + 1} →</Link>}
            </nav>
          )}
        </>
      )}
    </ExploreShell>
  )
}
