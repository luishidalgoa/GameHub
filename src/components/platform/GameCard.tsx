'use client'

import Image from 'next/image'
import { Heart, Pencil, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GameListItem } from '@/types/game'

interface Props {
  game: GameListItem & { fileName: string }
  onSelect: (id: number) => void
  onToggleFavorite: (id: number, current: boolean) => void
  isAdmin?: boolean
}

export function GameCard({ game, onSelect, onToggleFavorite, isAdmin = false }: Props) {
  const cover = game.coverPath ?? game.coverUrl

  return (
    <div
      className="group relative rounded-lg overflow-hidden cursor-pointer bg-card border border-border hover:border-primary/40 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 touch-manipulation"
      onClick={() => onSelect(game.id)}
    >
      {/* Cover */}
      <div className="aspect-[2/3] relative bg-secondary">
        {cover ? (
          <Image
            src={cover}
            alt={game.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl font-bold text-muted-foreground/30 select-none">
              {game.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Desktop hover overlay (hidden on touch screens) */}
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex items-end p-2">
          <div className="flex gap-1.5 w-full justify-end">
            {isAdmin && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFavorite(game.id, game.isFavorite)
                }}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  game.isFavorite
                    ? 'bg-red-600/80 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-red-600/80 hover:text-white'
                )}
                aria-label={game.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Heart className="w-3.5 h-3.5" fill={game.isFavorite ? 'currentColor' : 'none'} />
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

        {/* Favorite toggle — only for admins */}
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite(game.id, game.isFavorite)
            }}
            className={cn(
              'absolute top-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center z-10 touch-manipulation transition-colors',
              game.isFavorite
                ? 'bg-red-600 text-white'
                : 'bg-black/40 text-white/60 hover:bg-red-600/80 hover:text-white sm:opacity-0 sm:group-hover:opacity-100'
            )}
            aria-label={game.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className="w-3.5 h-3.5" fill={game.isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="p-2">
        <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">{game.title}</p>
        {game.releaseYear && (
          <p className="text-xs text-muted-foreground mt-0.5">{game.releaseYear}</p>
        )}
      </div>
    </div>
  )
}
