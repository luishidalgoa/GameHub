'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Heart, Pencil, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RatingPill } from '@/components/shared/RatingPill'
import { getPlatformIdentity } from '@/lib/platform-identity'
import { regionFlag } from '@/lib/rom-tags'
import type { GameListItem } from '@/types/game'

interface Props {
  game: GameListItem & { fileName: string }
  onSelect: (id: number) => void
  onToggleFavorite: (id: number, current: boolean) => void
  isAdmin?: boolean
  thumbnailWidth?: number
  thumbnailHeight?: number
  /** Platform slug — tints the card's hover glow/border with its brand color. */
  platformSlug?: string
  /** When set, the card fades+slides in with a staggered delay by this index. */
  animateIndex?: number
}

export function GameCard({
  game,
  onSelect,
  onToggleFavorite,
  isAdmin = false,
  thumbnailWidth = 200,
  thumbnailHeight = 300,
  platformSlug,
  animateIndex,
}: Props) {
  const cover = game.coverPath ?? game.coverUrl
  const [imgLoaded, setImgLoaded] = useState(false)
  const [favPop, setFavPop] = useState(false)
  // Cap the cumulative delay so a full page never feels slow (~24 cards × 22ms).
  const staggerDelay = animateIndex != null ? Math.min(animateIndex, 24) * 22 : 0
  // Per-platform brand glow on hover — same identity that drives PlatformCard
  // and the Sidebar, so a card always feels like it belongs to its console.
  const identity = platformSlug ? getPlatformIdentity(platformSlug) : null

  const cardStyle: React.CSSProperties = {
    ...(animateIndex != null ? { animationDelay: `${staggerDelay}ms` } : {}),
    ...(identity ? ({ '--platform-glow': identity.glow } as React.CSSProperties) : {}),
  }

  const toggleFav = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!game.isFavorite) { setFavPop(true); setTimeout(() => setFavPop(false), 360) }
    onToggleFavorite(game.id, game.isFavorite)
  }

  return (
    <div
      className={cn(
        'group relative rounded-lg overflow-hidden cursor-pointer bg-card border border-border transition-all duration-200 hover:-translate-y-0.5 touch-manipulation',
        identity
          ? 'hover:border-[color:var(--platform-glow)] hover:shadow-[0_12px_28px_-8px_var(--platform-glow)]'
          : 'hover:border-primary/40 hover:shadow-lg hover:shadow-black/40',
        animateIndex != null && 'animate-card-in',
      )}
      style={cardStyle}
      onClick={() => onSelect(game.id)}
    >
      {/* Cover */}
      <div
        style={{ aspectRatio: `${thumbnailWidth}/${thumbnailHeight}` }}
        className="relative bg-secondary overflow-hidden"
      >
        {cover ? (
          <>
            {/* Skeleton shimmer — visible until image loads */}
            {!imgLoaded && (
              <div className="absolute inset-0 bg-secondary animate-pulse" />
            )}
            <Image
              src={cover}
              alt={game.title}
              fill
              className={cn(
                'object-cover transition-opacity duration-500',
                imgLoaded ? 'opacity-100' : 'opacity-0',
              )}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
              loading="lazy"
              unoptimized
              onLoad={() => setImgLoaded(true)}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl font-bold text-muted-foreground/30 select-none">
              {game.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Rating badge — top-left (favorite heart is top-right). Only shows
            when the game has a metacritic/rating score. */}
        <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
          <RatingPill score={game.rawgScore} metacritic={game.rawgMetacritic} rating={game.rawgRating} />
        </div>

        {/* Desktop hover overlay */}
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex items-end p-2">
          <div className="flex gap-1.5 w-full justify-end">
            {isAdmin && (
              <button
                onClick={toggleFav}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  game.isFavorite
                    ? 'bg-red-600/80 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-red-600/80 hover:text-white',
                )}
                aria-label={game.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Heart className={cn('w-3.5 h-3.5', favPop && 'animate-fav-pop')} fill={game.isFavorite ? 'currentColor' : 'none'} />
              </button>
            )}
            {isAdmin && (
              <a
                href={`/admin/games/${game.id}`}
                onClick={(e) => e.stopPropagation()}
                className="p-2 rounded-md bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                aria-label="Edit game"
              >
                <Pencil className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(game.id) }}
              className="p-2 rounded-md bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
              aria-label="View details"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Favorite toggle — admin only */}
        {isAdmin && (
          <button
            onClick={toggleFav}
            className={cn(
              'absolute top-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center z-10 touch-manipulation transition-colors',
              game.isFavorite
                ? 'bg-red-600 text-white'
                : 'bg-black/40 text-white/60 hover:bg-red-600/80 hover:text-white sm:opacity-0 sm:group-hover:opacity-100',
            )}
            aria-label={game.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className={cn('w-3.5 h-3.5', favPop && 'animate-fav-pop')} fill={game.isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="p-2">
        <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">{game.title}</p>
        {/* Year + region. The region tells sibling editions of the same game
            apart at a glance, without having to open the detail modal. */}
        {(game.releaseYear || game.region) && (
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {game.releaseYear && <span>{game.releaseYear}</span>}
            {game.region && (
              <span
                title={game.region}
                className="inline-flex items-center gap-0.5 rounded border border-border/70 px-1 py-px text-[10px] leading-none"
              >
                {regionFlag(game.region) && <span aria-hidden>{regionFlag(game.region)}</span>}
                {game.region}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Full-card skeleton shown while a new page is loading. */
export function SkeletonCard({
  thumbnailWidth = 200,
  thumbnailHeight = 300,
}: {
  thumbnailWidth?: number
  thumbnailHeight?: number
}) {
  return (
    <div className="rounded-lg overflow-hidden border border-border bg-card animate-pulse">
      <div
        style={{ aspectRatio: `${thumbnailWidth}/${thumbnailHeight}` }}
        className="bg-muted"
      />
      <div className="p-2 space-y-1.5">
        <div className="h-3 bg-muted rounded w-4/5" />
        <div className="h-2.5 bg-muted rounded w-1/3" />
      </div>
    </div>
  )
}
