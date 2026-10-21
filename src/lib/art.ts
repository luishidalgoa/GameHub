import sharp from 'sharp'
import { db } from '@/lib/db'
import { uploadToS3 } from '@/lib/s3'
import { providerFetch } from '@/lib/metadata/http'
import {
  getLaunchBoxProvider, getLaunchBoxPlatformName, LAUNCHBOX_PLATFORM_NAMES,
  type LaunchBoxGame,
} from '@/lib/metadata/launchbox'
import { calcTitleConfidence, AUTO_THRESHOLD } from '@/lib/metadata/scoring'
import { pickBackdrop, pickFanart, pickLogo } from '@/lib/metadata/launchbox-art'
import { paletteOf } from '@/lib/palette'
import { pixelScale } from '@/lib/pixel-art'
import { fetchLibretroScreens } from '@/lib/metadata/libretro'

const BACKDROP_MAX_WIDTH = 1920
const TILE_MAX_WIDTH = 1600
const LOGO_MAX_WIDTH = 800
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
 * Fetch the art of one game: from LaunchBox its original backdrop, fanart and
 * logo; for a game with no fanart (the poorly documented ones, mostly GBA and
 * SNES) the in-game snapshot or title screen from libretro-thumbnails stands in
 * for the tile, and for the backdrop when LaunchBox has none. Everything is
 * stored in MinIO as WebP and the backdrop's palette is recorded. A game with no
 * art at all is still marked as checked, so it is not searched again every run;
 * a network failure throws and leaves it unmarked to be retried.
 */
export async function fetchGameArt(game: ArtGame, paceMs = 600): Promise<ArtOutcome> {
  const found = await resolveLaunchBoxGame(game, paceMs)
  const images = found?.lb.images ?? []
  const backdrop = pickBackdrop(images)
  const logo = pickLogo(images)
  const fanart = pickFanart(images)

  const retro = fanart ? null : await fetchLibretroScreens(game.fileName, game.platformSlug)
  const retroUrl = retro?.snap ?? retro?.title ?? null

  const data: Record<string, unknown> = { artCheckedAt: new Date() }
  if (found) data.launchboxId = found.id
  const version = Date.now()
  const prefix = `art/${game.platformSlug}/${game.id}`
  let stored = false

  if (backdrop) {
    await sleep(paceMs)
    const source = await download(backdrop.image.url)
    const webp = await sharp(source)
      .resize({ width: BACKDROP_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
    await uploadToS3(webp, `${prefix}-backdrop.webp`)
    data.backdropPath = `${prefix}-backdrop.webp?v=${version}`
    data.backdropKind = backdrop.kind
    data.themePalette = JSON.stringify(await paletteOf(webp))
    if (backdrop.kind === 'fanart') data.tilePath = data.backdropPath
    stored = true
  }
  if (fanart && backdrop?.kind !== 'fanart') {
    await sleep(paceMs)
    const source = await download(fanart.url)
    const webp = await sharp(source)
      .resize({ width: TILE_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    await uploadToS3(webp, `${prefix}-tile.webp`)
    data.tilePath = `${prefix}-tile.webp?v=${version}`
    stored = true
  }
  if (retroUrl) {
    const webp = await pixelWebp(retroUrl)
    await uploadToS3(webp, `${prefix}-tile.webp`)
    data.tilePath = `${prefix}-tile.webp?v=${version}`
    if (!backdrop) {
      // No LaunchBox backdrop: the snapshot is blurred behind the page anyway.
      data.backdropPath = data.tilePath
      data.backdropKind = retro?.snap ? 'snap' : 'title'
      data.themePalette = JSON.stringify(await paletteOf(webp))
    }
    stored = true
  }
  if (logo) {
    await sleep(paceMs)
    const source = await download(logo.url)
    const webp = await sharp(source)
      .resize({ width: LOGO_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 88, alphaQuality: 95 })
      .toBuffer()
    await uploadToS3(webp, `${prefix}-logo.webp`)
    data.logoPath = `${prefix}-logo.webp?v=${version}`
    stored = true
  }

  await db.game.update({ where: { id: game.id }, data })
  if (stored) return 'applied'
  return found ? 'no-art' : 'no-match'
}
