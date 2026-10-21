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

/**
 * Fetch the original backdrop and logo of one game from LaunchBox, store them in
 * MinIO as WebP and record the backdrop's palette. A game that has no match or no
 * art is still marked as checked, so it is not searched again every run; a
 * network failure throws and leaves it unmarked to be retried.
 */
export async function fetchGameArt(game: ArtGame, paceMs = 600): Promise<ArtOutcome> {
  const found = await resolveLaunchBoxGame(game, paceMs)
  if (!found) {
    await db.game.update({ where: { id: game.id }, data: { artCheckedAt: new Date() } })
    return 'no-match'
  }

  const backdrop = pickBackdrop(found.lb.images)
  const logo = pickLogo(found.lb.images)
  const fanart = pickFanart(found.lb.images)
  if (!backdrop && !logo && !fanart) {
    await db.game.update({ where: { id: game.id }, data: { launchboxId: found.id, artCheckedAt: new Date() } })
    return 'no-art'
  }

  const version = Date.now()
  const prefix = `art/${game.platformSlug}/${game.id}`
  const data: Record<string, unknown> = { launchboxId: found.id, artCheckedAt: new Date() }

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
  }

  await db.game.update({ where: { id: game.id }, data })
  return 'applied'
}
