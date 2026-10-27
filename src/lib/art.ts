import sharp from 'sharp'
import { db } from '@/lib/db'
import { applyMetadata } from '@/lib/metadata/apply'
import { uploadToS3 } from '@/lib/s3'
import { storeGameImages } from '@/lib/game-images'
import { providerFetch } from '@/lib/metadata/http'
import {
  getLaunchBoxProvider, getLaunchBoxPlatformName, LAUNCHBOX_PLATFORM_NAMES,
  type LaunchBoxGame,
} from '@/lib/metadata/launchbox'
import type { LaunchBoxImage } from '@/lib/metadata/launchbox'
import { calcTitleConfidence, AUTO_THRESHOLD } from '@/lib/metadata/scoring'
import { pickBackdrop, pickFanart, pickLogo } from '@/lib/metadata/launchbox-art'
import { paletteOf } from '@/lib/palette'
import { pixelScale } from '@/lib/pixel-art'
import { fetchLibretroScreens } from '@/lib/metadata/libretro'

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export interface ArtGame {
  id: number
  title: string
  fileName: string
  launchboxId: number | null
  platformSlug: string
  /** libretro system of the game (see libretroSystemFor); null when unknown. */
  retroSystem?: string | null
}

async function download(url: string): Promise<Buffer> {
  const res = await providerFetch(url)
  if (!res.ok) throw new Error(`image ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_DOWNLOAD_BYTES) throw new Error('image too large')
  return buf
}

/** The LaunchBox page of a game: the stored id, else the best title match. */
async function resolveLaunchBoxGame(game: ArtGame, paceMs: number): Promise<{ lb: LaunchBoxGame; id: number } | null> {
  const provider = await getLaunchBoxProvider(game.platformSlug)
  if (game.launchboxId) {
    const lb = await provider.fetchById(game.launchboxId) as LaunchBoxGame | null
    return lb ? { lb, id: game.launchboxId } : null
  }
  const expected = ((await getLaunchBoxPlatformName(game.platformSlug)) ?? LAUNCHBOX_PLATFORM_NAMES[game.platformSlug] ?? '').toLowerCase()
  const results = await provider.search(game.title, game.platformSlug)
  const scored = results
    .map(r => ({
      r,
      confidence: calcTitleConfidence(game.title, r.title, Boolean(expected) && (r.platformName ?? '').toLowerCase() === expected),
    }))
    .sort((a, b) => b.confidence - a.confidence)
  const best = scored[0]
  if (!best || best.confidence < AUTO_THRESHOLD) return null
  await sleep(paceMs)
  const lb = await provider.fetchById(best.r.id) as LaunchBoxGame | null
  return lb ? { lb, id: best.r.id } : null
}

/** A retro snapshot as WebP: whole-number nearest-neighbor upscale, so pixels stay crisp squares. */
async function pixelWebp(url: string): Promise<Buffer> {
  const source = await download(url)
  const { width = 0 } = await sharp(source).metadata()
  const scale = pixelScale(width)
  return sharp(source)
    .resize({ width: width * scale, kernel: 'nearest' })
    .webp({ quality: 85 })
    .toBuffer()
}

export type ArtOutcome = 'applied' | 'no-art' | 'no-match'

/**
 * The one place LaunchBox images become the game's art. Every image LaunchBox publishes
 * goes into the repository (GameImage, categorized); the banner, the fanart and the logo
 * are then pointed at the stored copies, so nothing is downloaded twice. Used by the
 * metadata fill (Buscar metadatos and the batch) and by the art job. Locks are honoured:
 * a field the owner set by hand is not replaced.
 *
 * A game with no LaunchBox fanart takes the libretro snapshot for its wide tile.
 */
/** The art blocks a LaunchBox store writes into the game's own columns. */
export type ArtBlock = 'backdrop' | 'tile' | 'logo'

export async function storeLaunchBoxArt(
  game: { id: number; platformSlug: string; fileName?: string; retroSystem?: string | null },
  imagesIn: LaunchBoxImage[],
  opts: { found: boolean; launchboxId?: number | null; paceMs?: number; /** The blocks this call writes. Undefined = all of them. */ only?: ReadonlySet<ArtBlock> },
): Promise<ArtOutcome> {
  const want = (block: ArtBlock) => !opts.only || opts.only.has(block)
  // Images the owner removed are left out: not stored again, and never picked as banner, fanart or logo.
  let images = imagesIn
  const removed = new Set((await db.gameImage.findMany({
    where: { gameId: game.id, removedAt: { not: null } }, select: { sourceUrl: true },
  })).map(r => r.sourceUrl))
  images = images.filter(i => !removed.has(i.url))
  const { byUrl } = await storeGameImages({ id: game.id, platformSlug: game.platformSlug }, images, opts.paceMs ?? 600)
  const stored = (img: LaunchBoxImage | null | undefined) => (img ? byUrl.get(img.url) ?? null : null)

  const backdrop = pickBackdrop(images)
  const bd = stored(backdrop?.image)
  const fa = stored(pickFanart(images))
  const lo = stored(pickLogo(images))

  const data: Record<string, unknown> = { artCheckedAt: new Date() }
  if (opts.launchboxId) data.launchboxId = opts.launchboxId
  if (want('backdrop') && bd && backdrop) {
    data.backdropPath = bd.key
    data.backdropKind = backdrop.kind
    if (bd.buffer) data.themePalette = JSON.stringify(await paletteOf(bd.buffer))
  }
  if (want('tile') && fa) data.tilePath = fa.key
  if (want('logo') && lo) data.logoPath = lo.key

  // No LaunchBox fanart: the libretro snapshot stands in for the wide tile.
  let retroStored = false
  if (!fa && (want('tile') || want('backdrop'))) {
    const retro = await fetchLibretroScreens(game.fileName ?? '', game.retroSystem === undefined ? game.platformSlug : (game.retroSystem ?? ''))
    const retroUrl = retro.snap ?? retro.title ?? null
    if (retroUrl) {
      const webp = await pixelWebp(retroUrl)
      const key = `art/${game.platformSlug}/${game.id}-tile.webp`
      await uploadToS3(webp, key)
      const stamped = `${key}?v=${Date.now()}`
      if (want('tile')) data.tilePath = stamped
      if (!bd && want('backdrop')) {
        data.backdropPath = stamped
        data.backdropKind = retro.snap ? 'snap' : 'title'
        data.themePalette = JSON.stringify(await paletteOf(webp))
      }
      retroStored = true
    }
  }

  const inRepo = await db.gameImage.count({ where: { gameId: game.id } })
  const artStatus = inRepo > 0 || retroStored ? 'ok' : opts.found ? 'no-art' : 'no-match'
  data.artStatus = artStatus
  // applyMetadata, not a raw update: the owner's locks on these fields are honoured.
  await applyMetadata(game.id, { origin: 'auto', data })
  if (artStatus === 'ok') return 'applied'
  return opts.found ? 'no-art' : 'no-match'
}

/**
 * Fetch the art of one game by its own search (the art job). The same store as the metadata fill.
 */
export async function fetchGameArt(game: ArtGame, paceMs = 600): Promise<ArtOutcome> {
  const found = await resolveLaunchBoxGame(game, paceMs)
  return storeLaunchBoxArt(
    { id: game.id, platformSlug: game.platformSlug, fileName: game.fileName, retroSystem: game.retroSystem },
    found?.lb.images ?? [],
    { found: !!found, launchboxId: found?.id, paceMs },
  )
}
