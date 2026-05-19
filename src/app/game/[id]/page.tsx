import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Calendar, Tag, User, Building2, HardDrive, Pencil } from 'lucide-react'
import { db } from '@/lib/db'
import { getS3Config, resolveCoverPath } from '@/lib/s3'
import { formatBytes } from '@/lib/utils'
import { DownloadButton } from '@/components/shared/DownloadButton'
import { ScreenshotCarousel } from '@/components/game/ScreenshotCarousel'
import { isAdminSession } from '@/lib/auth'
import { getRawgProvider } from '@/lib/metadata/rawg'

export const dynamic = 'force-dynamic'

interface Props {
  params: { id: string }
}

export default async function GamePage({ params }: Props) {
  const id = parseInt(params.id, 10)
  const [game, isAdmin, rawgSetting, s3Config] = await Promise.all([
    db.game.findUnique({ where: { id }, include: { platform: true, dlcs: true } }),
    isAdminSession(),
    db.setting.findUnique({ where: { key: 'rawg_api_key' } }),
    getS3Config(),
  ])

  if (!game) notFound()

  // Fetch RAWG screenshots if the game has been matched to RAWG
  let screenshots: string[] = []
  if (game.rawgSlug) {
    const provider = getRawgProvider(rawgSetting?.value)
    if (provider) {
      screenshots = await provider.fetchScreenshots(game.rawgSlug).catch(() => [])
    }
  }

  const cover = resolveCoverPath(game.coverPath, s3Config) ?? game.coverUrl
  const thumbW = game.platform?.thumbnailWidth  ?? 200
  const thumbH = game.platform?.thumbnailHeight ?? 300

  return (
    <div>
      <Link
        href={game.platform ? `/platform/${game.platform.slug}` : '/'}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to {game.platform?.name ?? 'Library'}
      </Link>

      <div className="flex gap-8 lg:gap-12">
        {/* Cover — aspect ratio from platform thumbnail settings, wider on large screens */}
        <div className="flex-shrink-0 w-40 sm:w-48 lg:w-64">
          <div
            className="relative rounded-xl overflow-hidden bg-secondary shadow-2xl"
            style={{ aspectRatio: `${thumbW} / ${thumbH}` }}
          >
            {cover ? (
              <Image src={cover} alt={game.title} fill className="object-cover" unoptimized />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-6xl font-bold text-muted-foreground/30">{game.title.charAt(0)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-bold leading-tight">{game.title}</h1>
            <div className="flex-shrink-0 flex items-center gap-2">
              {game.fileSize > 0n && (
                <DownloadButton gameId={game.id} fileSize={game.fileSize.toString()} />
              )}
              {isAdmin && (
                <Link
                  href={`/admin/games/${game.id}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-secondary hover:bg-accent transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </Link>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {game.platform && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                {game.platform.name}
              </span>
            )}
            {game.region && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                {game.region}
              </span>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
            {game.releaseYear && <MetaRow icon={<Calendar className="w-4 h-4" />} label="Year" value={String(game.releaseYear)} />}
            {game.genre && <MetaRow icon={<Tag className="w-4 h-4" />} label="Genre" value={game.genre} />}
            {game.developer && <MetaRow icon={<User className="w-4 h-4" />} label="Developer" value={game.developer} />}
            {game.publisher && <MetaRow icon={<Building2 className="w-4 h-4" />} label="Publisher" value={game.publisher} />}
            {game.fileSize > 0n && (
              <MetaRow icon={<HardDrive className="w-4 h-4" />} label="Size" value={formatBytes(game.fileSize)} />
            )}
          </div>

          {game.description && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</h2>
              <p className="text-sm text-foreground/80 leading-relaxed">{game.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Screenshots */}
      {screenshots.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Screenshots</h2>
          <ScreenshotCarousel screenshots={screenshots} />
        </div>
      )}

      {/* Trailer */}
      {game.trailerUrl && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Trailer</h2>
          <TrailerBlock url={game.trailerUrl} />
        </div>
      )}

      {/* Notes */}
      {game.customNotes && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</h2>
          <p className="text-sm text-foreground/70 leading-relaxed whitespace-pre-line">{game.customNotes}</p>
        </div>
      )}

      {/* Updates */}
      {game.dlcs.filter((d) => d.type === 'update').length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Updates ({game.dlcs.filter((d) => d.type === 'update').length})
          </h2>
          <div className="space-y-1.5">
            {game.dlcs.filter((d) => d.type === 'update').map((dlc) => (
              <div key={dlc.id} className="flex items-center gap-3 bg-secondary/50 rounded-lg px-4 py-2.5 text-sm">
                <span className="flex-1 text-foreground/80 truncate">{dlc.title ?? dlc.fileName}</span>
                <span className="text-muted-foreground text-xs mr-2">{formatBytes(dlc.fileSize)}</span>
                <DownloadButton gameId={game.id} dlcId={dlc.id} label="Update" fileSize={dlc.fileSize.toString()} variant="secondary" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DLCs */}
      {game.dlcs.filter((d) => d.type === 'dlc').length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            DLC ({game.dlcs.filter((d) => d.type === 'dlc').length})
          </h2>
          <div className="space-y-1.5">
            {game.dlcs.filter((d) => d.type === 'dlc').map((dlc) => (
              <div key={dlc.id} className="flex items-center gap-3 bg-secondary/50 rounded-lg px-4 py-2.5 text-sm">
                <span className="flex-1 text-foreground/80 truncate">{dlc.title ?? dlc.fileName}</span>
                <span className="text-muted-foreground text-xs mr-2">{formatBytes(dlc.fileSize)}</span>
                <DownloadButton gameId={game.id} dlcId={dlc.id} label="DLC" fileSize={dlc.fileSize.toString()} variant="secondary" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mods */}
      {game.dlcs.filter((d) => d.type === 'mod').length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Mods ({game.dlcs.filter((d) => d.type === 'mod').length})
          </h2>
          <div className="space-y-1.5">
            {game.dlcs.filter((d) => d.type === 'mod').map((mod) => (
              <div key={mod.id} className="flex items-center gap-3 bg-secondary/50 rounded-lg px-4 py-2.5 text-sm">
                <span className="flex-1 text-foreground/80 truncate">{mod.title ?? mod.fileName}</span>
                <span className="text-muted-foreground text-xs mr-2">{formatBytes(mod.fileSize)}</span>
                <DownloadButton gameId={game.id} dlcId={mod.id} label="Mod" fileSize={mod.fileSize.toString()} variant="secondary" />
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="mt-8 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground/40 font-mono break-all">{game.filePath}</p>
        </div>
      )}
    </div>
  )
}

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <span className="flex-shrink-0">{icon}</span>
      <span className="text-muted-foreground/70">{label}:</span>
      <span className="text-foreground/90">{value}</span>
    </div>
  )
}

function TrailerBlock({ url }: { url: string }) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/)
  const videoId = m?.[1]

  if (!videoId) return null

  return (
    <div className="aspect-video rounded-xl overflow-hidden max-w-2xl">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`}
        className="w-full h-full"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />
    </div>
  )
}
