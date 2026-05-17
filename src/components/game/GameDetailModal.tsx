'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import useSWR from 'swr'
import { useTranslations } from 'next-intl'
import { X, Heart, Pencil, ExternalLink, HardDrive, Calendar, Tag, User, Building2 } from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import { DownloadButton } from '@/components/shared/DownloadButton'
import { ScreenshotCarousel } from '@/components/game/ScreenshotCarousel'
import type { Game } from '@/types/game'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  gameId: number
  onClose: () => void
}

export function GameDetailModal({ gameId, onClose }: Props) {
  const t = useTranslations('GameDetail')
  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const { data: auth } = useSWR<{ admin: boolean }>('/api/auth/me', fetcher)
  const { data: ssData } = useSWR<{ screenshots: string[] }>(
    game?.rawgSlug ? `/api/games/${gameId}/screenshots` : null,
    fetcher,
  )
  const screenshots = ssData?.screenshots ?? []

  useEffect(() => {
    fetch(`/api/games/${gameId}`)
      .then((r) => r.json())
      .then((data) => { setGame(data); setLoading(false) })
  }, [gameId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const cover = game?.coverPath ?? game?.coverUrl

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet — bottom sheet on mobile, right panel on desktop */}
      <div className="relative z-10 w-full sm:h-full sm:max-w-2xl max-h-[92dvh] sm:max-h-full rounded-t-2xl sm:rounded-none bg-card border-t sm:border-t-0 sm:border-l border-border overflow-y-auto shadow-2xl flex flex-col animate-in slide-in-from-bottom sm:slide-in-from-right duration-300">
        {/* Drag handle — mobile only */}
        <div className="sm:hidden flex-shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-semibold text-base sm:text-lg truncate pr-3">
            {loading ? t('loading') : game?.title}
          </h2>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {game && (
              <>
                <DownloadButton
                  gameId={game.id}
                  fileSize={game.fileSize}
                  variant="primary"
                />
                {auth?.admin && (
                  <Link
                    href={`/admin/games/${game.id}`}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-secondary hover:bg-accent transition-colors touch-manipulation"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t('edit')}</span>
                  </Link>
                )}
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground touch-manipulation"
              aria-label={t('close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : game ? (
          <div className="flex-1 p-4 sm:p-6">
            {/* Top section: cover + meta */}
            <div className="flex gap-6 mb-6">
              {/* Cover */}
              <div className="flex-shrink-0 w-36">
                <div
                  className="relative rounded-lg overflow-hidden bg-secondary"
                  style={{
                    aspectRatio: `${game.platform?.thumbnailWidth ?? 200} / ${game.platform?.thumbnailHeight ?? 300}`,
                  }}
                >
                  {cover ? (
                    <Image src={cover} alt={game.title} fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-5xl font-bold text-muted-foreground/30">
                        {game.title.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Favorite + Platform badges */}
                <div className="mt-3 space-y-1.5">
                  {game.platform && (
                    <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                      {game.platform.name}
                    </span>
                  )}
                  {game.region && (
                    <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border ml-1">
                      {game.region}
                    </span>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xl font-bold leading-tight">{game.title}</h3>
                  {game.isFavorite && (
                    <Heart className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" />
                  )}
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  {game.releaseYear && (
                    <MetaRow icon={<Calendar className="w-3.5 h-3.5" />} label={t('year')} value={String(game.releaseYear)} />
                  )}
                  {game.genre && (
                    <MetaRow icon={<Tag className="w-3.5 h-3.5" />} label={t('genre')} value={game.genre} />
                  )}
                  {game.developer && (
                    <MetaRow icon={<User className="w-3.5 h-3.5" />} label={t('developer')} value={game.developer} />
                  )}
                  {game.publisher && (
                    <MetaRow icon={<Building2 className="w-3.5 h-3.5" />} label={t('publisher')} value={game.publisher} />
                  )}
                  <MetaRow
                    icon={<HardDrive className="w-3.5 h-3.5" />}
                    label={t('size')}
                    value={formatBytes(BigInt(game.fileSize))}
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            {game.description && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t('description')}</h4>
                <p className="text-sm text-foreground/80 leading-relaxed line-clamp-6">{game.description}</p>
              </div>
            )}

            {/* Trailer */}
            {game.trailerUrl && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t('trailer')}</h4>
                <TrailerEmbed url={game.trailerUrl} watchLabel={t('watchTrailer')} />
              </div>
            )}

            {/* Screenshots */}
            {screenshots.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Screenshots</h4>
                <ScreenshotCarousel screenshots={screenshots} />
              </div>
            )}

            {/* Custom notes */}
            {game.customNotes && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t('notes')}</h4>
                <p className="text-sm text-foreground/70 leading-relaxed whitespace-pre-line">{game.customNotes}</p>
              </div>
            )}

            {/* Updates */}
            {game.dlcs && game.dlcs.filter((d) => d.type === 'update').length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {t('updates', { count: game.dlcs.filter((d) => d.type === 'update').length })}
                </h4>
                <div className="space-y-1">
                  {game.dlcs.filter((d) => d.type === 'update').map((dlc) => (
                    <div key={dlc.id} className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded px-3 py-1.5">
                      <span className="flex-1 truncate">{dlc.title ?? dlc.fileName}</span>
                      <span className="flex-shrink-0">{formatBytes(BigInt(dlc.fileSize))}</span>
                      <DownloadButton gameId={game.id} dlcId={dlc.id} label="Update" variant="secondary" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DLCs */}
            {game.dlcs && game.dlcs.filter((d) => d.type !== 'update').length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {t('dlc', { count: game.dlcs.filter((d) => d.type !== 'update').length })}
                </h4>
                <div className="space-y-1">
                  {game.dlcs.filter((d) => d.type !== 'update').map((dlc) => (
                    <div key={dlc.id} className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded px-3 py-1.5">
                      <span className="flex-1 truncate">{dlc.title ?? dlc.fileName}</span>
                      <span className="flex-shrink-0">{formatBytes(BigInt(dlc.fileSize))}</span>
                      <DownloadButton gameId={game.id} dlcId={dlc.id} label="DLC" variant="secondary" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* File path */}
            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground/50 font-mono break-all">{game.filePath}</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            {t('notFound')}
          </div>
        )}
      </div>
    </div>
  )
}

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground flex-shrink-0 mt-0.5">{icon}</span>
      <span className="text-muted-foreground w-20 flex-shrink-0">{label}</span>
      <span className="text-foreground/90 flex-1">{value}</span>
    </div>
  )
}

function TrailerEmbed({ url, watchLabel }: { url: string; watchLabel: string }) {
  const getYouTubeId = (u: string) => {
    const m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/)
    return m?.[1]
  }

  const videoId = getYouTubeId(url)

  if (videoId) {
    return (
      <div className="aspect-video rounded-lg overflow-hidden">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          className="w-full h-full"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      </div>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm text-primary hover:underline"
    >
      <ExternalLink className="w-4 h-4" />
      {watchLabel}
    </a>
  )
}
