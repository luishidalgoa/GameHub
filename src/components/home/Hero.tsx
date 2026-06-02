import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ArrowRight } from 'lucide-react'
import { RatingPill } from '@/components/shared/RatingPill'

export interface HeroGame {
  id: number
  title: string
  platformName: string
  background: string | null    // screenshot/cover URL (resolved)
  cover: string | null         // resolved cover URL
  rawgScore: number | null
  rawgRating: number | null
  rawgMetacritic: number | null
}

/**
 * Featured banner for the most popular game, with its screenshot/fanart as a
 * blurred background. Server component. Renders nothing when there's no featured
 * game (e.g. before the popularity sync) so the home degrades gracefully.
 */
export async function Hero({ game }: { game: HeroGame | null }) {
  if (!game) return null
  const t = await getTranslations('Home')

  return (
    <section className="mb-8 relative overflow-hidden rounded-2xl border border-border">
      {/* Background image (blurred) + dark overlay */}
      {game.background && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={game.background}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-sm opacity-40"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/30" />

      <div className="relative z-10 flex items-center gap-5 p-5 sm:p-7">
        {/* Cover thumbnail */}
        {game.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.cover}
            alt={game.title}
            className="hidden sm:block w-24 lg:w-28 rounded-lg shadow-2xl object-cover flex-shrink-0"
            style={{ aspectRatio: '2/3' }}
          />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary/80 mb-1.5">
            {t('featured')}
          </p>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold leading-tight line-clamp-2">
            {game.title}
          </h2>
          <div className="flex items-center gap-2 mt-2">
            <RatingPill score={game.rawgScore} metacritic={game.rawgMetacritic} rating={game.rawgRating} size="md" />
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/80 text-muted-foreground border border-border">
              {game.platformName}
            </span>
          </div>
          <Link
            href={`/game/${game.id}`}
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t('featuredView')}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
