import { Fragment, type ReactNode } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { ArrowLeft, ArrowUpCircle, Languages, Package, Pencil, Puzzle } from 'lucide-react'
import { db } from '@/lib/db'
import { backdropUrl } from '@/lib/tile-art'
import { resolveCoverPath } from '@/lib/s3'
import { formatBytes } from '@/lib/utils'
import { languagesFromCsv } from '@/lib/rom-tags'
import { extractUpdateVersion, extractDlcName } from '@/lib/switch-labels'
import { parseExternalLinks } from '@/lib/external-links'
import { pickEditionKey, type Edition } from '@/lib/game-editions'
import { DownloadButton }     from '@/components/shared/DownloadButton'
import { BulkDownloadButton } from '@/components/shared/BulkDownloadButton'
import { RatingPill } from '@/components/shared/RatingPill'
import { RecordView } from '@/components/game/RecordView'
import { ScreenshotGallery } from '@/components/game/ScreenshotGallery'
import { ExternalLinkRows }   from '@/components/game/ExternalLinks'
import { RegionPicker, type PickerEdition } from '@/components/game/RegionPicker'
import { YouTubeEmbed }       from '@/components/shared/YouTubeEmbed'
import { isAdminSession } from '@/lib/auth'
import { getRawgProvider } from '@/lib/metadata/rawg'

export const dynamic = 'force-dynamic'

interface Props {
  params: { id: string }
  /** `region` is the grid's region filter, when the visitor came from a filtered grid. */
  searchParams: { region?: string }
}

export default async function GamePage({ params, searchParams }: Props) {
  const id = parseInt(params.id, 10)
  const [game, isAdmin, rawgSetting, t] = await Promise.all([
    db.game.findUnique({ where: { id }, include: { platform: true, dlcs: true } }),
    isAdminSession(),
    db.setting.findUnique({ where: { key: 'rawg_api_key' } }),
    getTranslations('GameDetail'),
  ])

  if (!game || (game.isHidden && !isAdmin)) notFound()

  // Screenshots: prefer the ones stored on the game (LaunchBox/RAWG saved by the
  // metadata job); fall back to a live RAWG fetch only when none are stored.
  let screenshots: string[] = []
  try {
    const stored = game.screenshotPaths ? JSON.parse(game.screenshotPaths) : []
    if (Array.isArray(stored)) screenshots = stored.filter((s: unknown): s is string => typeof s === 'string')
  } catch { /* ignore malformed */ }
  if (screenshots.length === 0 && game.rawgSlug) {
    const provider = getRawgProvider(rawgSetting?.value)
    if (provider) {
      screenshots = await provider.fetchScreenshots(game.rawgSlug).catch(() => [])
    }
  }

  // Background: the same rule as the home (banner first, box art last), see tile-art.ts.
  const backdrop = backdropUrl(game)
  // Theme colors from the artwork: they colour the backdrop when there is no image.
  const palette = parsePalette(game.themePalette)
  const [c0, c1] = palette ?? []
  const heroFallback = c0 && c1
    ? `radial-gradient(60% 80% at 30% 20%, ${c0} 0%, transparent 60%), radial-gradient(50% 70% at 80% 60%, ${c1} 0%, transparent 65%), #14101f`
    : 'radial-gradient(60% 80% at 30% 20%, #5b3aa8 0%, transparent 60%), radial-gradient(50% 70% at 80% 60%, #1f5f7a 0%, transparent 65%), #14101f'
  const cover = resolveCoverPath(game.coverPath) ?? game.coverUrl
  const thumbW = game.platform?.thumbnailWidth  ?? 200
  const thumbH = game.platform?.thumbnailHeight ?? 300

  const editions: Edition[] = [
    { key: 'primary', region: game.region, languages: languagesFromCsv(game.languages), fileSize: game.fileSize.toString() },
    ...game.dlcs
      .filter((d) => d.type === 'region')
      .map((d) => ({ key: `dlc-${d.id}`, dlcId: d.id, region: d.region, languages: languagesFromCsv(d.languages), fileSize: d.fileSize.toString() })),
  ]
  const pickerEditions: PickerEdition[] = editions.map((e) => ({
    ...e,
    downloadLabel: e.region ? t('downloadRegion', { region: e.region }) : t('download'),
  }))
  const initialEdition = pickEditionKey(editions, searchParams.region)

  const updates = game.dlcs.filter((d) => d.type === 'update')
  const dlcs    = game.dlcs.filter((d) => d.type === 'dlc')
  const mods    = game.dlcs.filter((d) => d.type === 'mod')
  const links   = parseExternalLinks(game.externalLinks)
  const hasContent = updates.length + dlcs.length + mods.length + links.length > 0

  const facts: [string, string][] = [
    game.releaseYear ? [t('year'), String(game.releaseYear)] : null,
    game.genre       ? [t('genre'), game.genre] : null,
    game.developer   ? [t('developer'), game.developer] : null,
    game.publisher   ? [t('publisher'), game.publisher] : null,
  ].filter((f): f is [string, string] => f !== null)
  const meta = facts.map(([, v]) => v).join(' · ')

  return (
    <div>
      <RecordView gameId={game.id} />

      {/* Fondo a sangre: el banner difuminado ocupa toda la página y se desvanece al final. */}
      <div className="relative -mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ maskImage: BACKDROP_FADE, WebkitMaskImage: BACKDROP_FADE }}
        >
          <div className="absolute -inset-10" style={{ background: heroFallback }}>
            {backdrop && (
              <Image src={backdrop} alt="" fill className="object-cover opacity-90" style={{ filter: 'blur(18px)' }} unoptimized />
            )}
          </div>
        </div>

        <section className="relative lg:h-[470px]">
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent" />

          <div className="relative z-10 flex h-full flex-col justify-between gap-8 px-4 py-6 sm:px-6 sm:py-10 xl:flex-row xl:items-center">
            <div className="flex min-w-0 gap-5 sm:gap-7 xl:max-w-[640px]">
              {cover && (
                <div
                  className="relative flex-shrink-0 self-start w-24 sm:w-32 lg:w-36 rounded-xl overflow-hidden bg-secondary shadow-2xl"
                  style={{ aspectRatio: `${thumbW} / ${thumbH}`, viewTransitionName: `game-cover-${game.id}` }}
                >
                  <Image src={cover} alt={game.title} fill className="object-cover" unoptimized />
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-4">
                <nav className="flex items-center justify-between gap-3 text-sm">
                  <Link
                    href={game.platform ? `/platform/${game.platform.slug}` : '/'}
                    className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to {game.platform?.name ?? 'Library'}
                  </Link>
                  {isAdmin && (
                    <Link
                      href={`/admin/games/${game.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background/40 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      {t('editSheet')}
                    </Link>
                  )}
                </nav>

                <h1 className="text-3xl sm:text-4xl font-bold leading-tight break-words">{game.title}</h1>
                {meta && <p className="text-sm text-muted-foreground">{meta}</p>}

                <div className="flex flex-wrap items-center gap-2">
                  <RatingPill score={game.rawgScore} metacritic={game.rawgMetacritic} rating={game.rawgRating} size="md" />
                  {game.platform && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                      {game.platform.name}
                    </span>
                  )}
                </div>

                <RegionPicker
                  gameId={game.id}
                  editions={pickerEditions}
                  initialKey={initialEdition}
                  groupLabel={t('region')}
                >
                  {hasContent && (
                    <a
                      href="#contenido"
                      className="px-4 py-2.5 rounded-lg text-sm bg-background/60 border border-border text-foreground hover:bg-accent transition-colors"
                    >
                      {t('moreContent')} ↓
                    </a>
                  )}
                </RegionPicker>
              </div>
            </div>

            {/* Tráiler: solo si el juego tiene uno. */}
            {game.trailerUrl && (
              <div className="w-full xl:w-[560px] flex-shrink-0">
                <YouTubeEmbed
                  url={game.trailerUrl}
                  watchLabel={t('watchTrailer')}
                  className="aspect-video w-full rounded-xl overflow-hidden border border-white/10 shadow-2xl"
                />
              </div>
            )}
          </div>
        </section>

        <div className="relative mt-8 flex flex-col gap-9 px-4 sm:px-6">
          {/* Capturas: justo debajo de la cabecera. */}
          {screenshots.length > 0 && (
            <section aria-labelledby="capturas" className="flex flex-col gap-3">
              <h2 id="capturas" className="text-lg font-semibold">{t('screenshots')}</h2>
              <ScreenshotGallery screenshots={screenshots} />
            </section>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-12">
            <section className="flex flex-col gap-4 min-w-0">
              {game.description && (
                <>
                  <h2 className="text-lg font-semibold">{t('about')}</h2>
                  <p className="max-w-[68ch] text-[15px] leading-relaxed text-foreground/80 whitespace-pre-line">{game.description}</p>
                </>
              )}
              {game.customNotes && (
                <>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t('notes')}</h3>
                  <p className="text-sm leading-relaxed text-foreground/70 whitespace-pre-line">{game.customNotes}</p>
                </>
              )}
            </section>

            {facts.length > 0 && (
              <aside className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">{t('ficha')}</h2>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  {facts.map(([label, value]) => (
                    <Fragment key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-foreground/90">{value}</dd>
                    </Fragment>
                  ))}
                </dl>
              </aside>
            )}
          </div>

          {/* Descargas y contenido: solo los grupos que existen. El juego base sale del botón y del selector de región. */}
          {hasContent && (
            <section id="contenido" aria-labelledby="contenido-h" className="flex flex-col gap-7 border-t border-border pt-7 scroll-mt-6">
              <h2 id="contenido-h" className="text-lg font-semibold">{t('contentTitle')}</h2>

              {updates.length > 0 && (
                <Group
                  icon={<ArrowUpCircle className="w-4 h-4" />}
                  title={t('updates', { count: updates.length })}
                  action={<BulkDownloadButton gameId={game.id} type="update" count={updates.length} />}
                >
                  {updates.map((dlc) => (
                    <ContentRow
                      key={dlc.id}
                      name={extractUpdateVersion(dlc.fileName) ?? dlc.title ?? dlc.fileName}
                      title={dlc.fileName}
                      size={dlc.fileSize}
                      action={<DownloadButton gameId={game.id} dlcId={dlc.id} label={t('download')} fileSize={dlc.fileSize.toString()} variant="secondary" />}
                    />
                  ))}
                </Group>
              )}

              {dlcs.length > 0 && (
                <Group
                  icon={<Package className="w-4 h-4" />}
                  title={t('dlc', { count: dlcs.length })}
                  action={<BulkDownloadButton gameId={game.id} type="dlc" count={dlcs.length} />}
                >
                  {dlcs.map((dlc) => (
                    <ContentRow
                      key={dlc.id}
                      name={extractDlcName(dlc.fileName) ?? dlc.title ?? dlc.fileName}
                      title={dlc.fileName}
                      size={dlc.fileSize}
                      action={<DownloadButton gameId={game.id} dlcId={dlc.id} label={t('download')} fileSize={dlc.fileSize.toString()} variant="secondary" />}
                    />
                  ))}
                </Group>
              )}

              {mods.length > 0 && (
                <Group
                  icon={<Puzzle className="w-4 h-4" />}
                  title={t('mods', { count: mods.length })}
                  action={<BulkDownloadButton gameId={game.id} type="mod" count={mods.length} />}
                >
                  {mods.map((mod) => (
                    <ContentRow
                      key={mod.id}
                      name={mod.title ?? mod.fileName}
                      title={mod.fileName}
                      size={mod.fileSize}
                      action={<DownloadButton gameId={game.id} dlcId={mod.id} label={t('download')} fileSize={mod.fileSize.toString()} variant="secondary" />}
                    />
                  ))}
                </Group>
              )}

              {links.length > 0 && (
                <Group icon={<Languages className="w-4 h-4" />} title={t('translations', { count: links.length })}>
                  <ExternalLinkRows links={links} />
                </Group>
              )}
            </section>
          )}

          {isAdmin && (
            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground/40 font-mono break-all">{game.filePath}</p>
            </div>
          )}
        </div>
        </div>
      </div>
    )
  }

  /** The banner fades out over the page, so the colour reaches the end of it. */
const BACKDROP_FADE = 'linear-gradient(to bottom, #000 0%, #000 35%, transparent 100%)'

function parsePalette(raw: string | null): string[] | null {
    if (!raw) return null
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) return arr.length ? arr : null
    } catch { /* ignore malformed */ }
    return null
  }

  function Group({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-border">
          <h3 className="flex items-center gap-2.5 text-[15px] font-semibold">
            <span className="text-primary">{icon}</span>
            {title}
          </h3>
          {action}
      </div>
      <div>{children}</div>
    </div>
  )
}

function ContentRow({ name, title, size, action }: { name: string; title: string; size: bigint; action: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/60 text-sm last:border-b-0">
      <span className="min-w-0 truncate text-foreground/90" title={title}>{name}</span>
      <span className="flex flex-shrink-0 items-center gap-4">
        <span className="text-xs text-muted-foreground tabular-nums">{formatBytes(size)}</span>
        {action}
      </span>
    </div>
  )
}
