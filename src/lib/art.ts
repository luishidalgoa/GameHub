import sharp from 'sharp'
import { db } from '@/lib/db'
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
}

export type ArtOutcome = 'applied' | 'no-art' | 'no-match'

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

/**
 * Fetch the art of one game. Every image LaunchBox publishes for it goes into the
 * repository (GameImage, categorized); the backdrop, the fanart tile and the logo
 * are then pointed at those stored copies, so nothing is downloaded twice. A game
 * with no LaunchBox art falls back to the libretro snapshot for its tile. The
 * status says why a game has no art (no match, or a match with no art), which is
 * the list of games still to complete by hand or from another source.
 */
export async function fetchGameArt(game: ArtGame, paceMs = 600): Promise<ArtOutcome> {
  const found = await resolveLaunchBoxGame(game, paceMs)
  const images: LaunchBoxImage[] = found?.lb.images ?? []
  const { byUrl } = await storeGameImages({ id: game.id, platformSlug: game.platformSlug }, images, paceMs)
  const stored = (img: LaunchBoxImage | null | undefined) => (img ? byUrl.get(img.url) ?? null : null)

  const backdrop = pickBackdrop(images)
  const bd = stored(backdrop?.image)
  const fa = stored(pickFanart(images))
  const lo = stored(pickLogo(images))

  const data: Record<string, unknown> = { artCheckedAt: new Date() }
  if (found) data.launchboxId = found.id
  if (bd && backdrop) {
    data.backdropPath = bd.key
    data.backdropKind = backdrop.kind
    if (bd.buffer) data.themePalette = JSON.stringify(await paletteOf(bd.buffer))
  }
  if (fa) data.tilePath = fa.key
  if (lo) data.logoPath = lo.key

  // No LaunchBox fanart: the libretro snapshot stands in for the wide tile.
  let retroStored = false
  if (!fa) {
    const retro = await fetchLibretroScreens(game.fileName, game.platformSlug)
    const retroUrl = retro.snap ?? retro.title ?? null
    if (retroUrl) {
      const webp = await pixelWebp(retroUrl)
      const key = `art/${game.platformSlug}/${game.id}-tile.webp`
      await uploadToS3(webp, key)
      data.tilePath = `${key}?v=${Date.now()}`
      if (!bd) {
        data.backdropPath = data.tilePath
        data.backdropKind = retro.snap ? 'snap' : 'title'
        data.themePalette = JSON.stringify(await paletteOf(webp))
      }
      retroStored = true
    }
  }

  const inRepo = await db.gameImage.count({ where: { gameId: game.id } })
  data.artStatus = inRepo > 0 || retroStored ? 'ok' : found ? 'no-art' : 'no-match'
  await db.game.update({ where: { id: game.id }, data })
  if (data.artStatus === 'ok') return 'applied'
  return found ? 'no-art' : 'no-match'
}
