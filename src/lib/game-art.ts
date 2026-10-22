import { createHash } from 'crypto'
import sharp from 'sharp'
import { db } from '@/lib/db'
import { applyMetadata } from '@/lib/metadata/apply'
import { parseMetadataSources } from '@/lib/metadata/sources'
import { saveCoverFromBuffer } from '@/lib/covers'
import { getFromS3, resolveCoverPath, uploadToS3 } from '@/lib/s3'
import { paletteOf } from '@/lib/palette'
import { lockFields, parseLocks } from '@/lib/manual-fields'
import { fetchRemoteImage, parseRemoteUrl } from '@/lib/remote-image'
import { categoryOf, fieldsFor, isInWindow, isManualKind, slotOf, type ArtCategory, type ManualKind } from '@/lib/art-manual'

/** An error the route turns into a response: the status says whose fault it was. */
export class ArtError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export interface ArtImage {
  id: number
  kind: string
  category: ArtCategory
  manual: boolean
  region: string | null
  width: number | null
  height: number | null
  url: string
}

export interface ShotEntry {
  /** The stored value: an external link or a bucket key. */
  value: string
  url: string
  external: boolean
  imageId: number | null
}

export interface GameArt {
  images: ArtImage[]
  cover: string | null
  backdrop: { url: string; kind: string | null; imageId: number | null } | null
  logo: { url: string; imageId: number | null } | null
  screenshots: ShotEntry[]
  palette: string[] | null
  locks: string[]
}

const bare = (p: string | null | undefined) => (p ? p.split('?')[0] : null)

export function parseShotList(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
  } catch {
    return []
  }
}

/** Everything the editor shows about a game's images: what is active and what is in the library. */
export async function listGameArt(gameId: number): Promise<GameArt> {
  const game = await db.game.findUnique({
    where: { id: gameId },
    select: { coverPath: true, coverUrl: true, backdropPath: true, backdropKind: true, logoPath: true, themePalette: true, screenshotPaths: true, manualFields: true },
  })
  if (!game) throw new ArtError(404, 'Game not found')
  const rows = await db.gameImage.findMany({ where: { gameId, removedAt: null }, orderBy: { id: 'asc' } })
  const byKey = new Map(rows.map(r => [r.s3Key, r.id]))

  let palette: string[] | null = null
  try { const p = game.themePalette ? JSON.parse(game.themePalette) : null; palette = Array.isArray(p) ? p : null } catch { /* none */ }

  return {
    images: rows.map(r => ({
      id: r.id, kind: r.kind, category: categoryOf(r.kind), manual: isManualKind(r.kind),
      region: r.region, width: r.width, height: r.height, url: `/api/covers/proxy/${r.s3Key}`,
    })),
    cover: resolveCoverPath(game.coverPath) ?? game.coverUrl,
    backdrop: game.backdropPath
      ? { url: resolveCoverPath(game.backdropPath)!, kind: game.backdropKind, imageId: byKey.get(bare(game.backdropPath)!) ?? null }
      : null,
    logo: game.logoPath ? { url: resolveCoverPath(game.logoPath)!, imageId: byKey.get(bare(game.logoPath)!) ?? null } : null,
    screenshots: parseShotList(game.screenshotPaths).map(value => {
      const external = value.startsWith('http://') || value.startsWith('https://')
      return { value, url: resolveCoverPath(value) ?? value, external, imageId: external ? null : byKey.get(bare(value)!) ?? null }
    }),
    palette,
    locks: parseLocks(game.manualFields),
  }
}

/** Resizes an upload to its category's size and stores it in the repository as the owner's image. */
export async function storeManualImage(
  game: { id: number; platformSlug: string },
  kind: ManualKind | 'screenshot',
  source: Buffer,
) {
  const webp = await sharp(source)
    .resize({ width: kind === 'logo' ? 1000 : 1920, withoutEnlargement: true })
    .webp({ quality: kind === 'logo' ? 90 : kind === 'screenshot' ? 82 : 84, alphaQuality: 95 })
    .toBuffer()
    .catch(() => null)
  if (!webp) throw new ArtError(400, 'No es una imagen válida')

  const meta = await sharp(webp).metadata()
  const palette = kind === 'logo' || kind === 'screenshot' ? null : JSON.stringify(await paletteOf(webp))
  const hash = createHash('sha1').update(`${kind}:${webp.length}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 8)
  const s3Key = `repo/${game.platformSlug}/${game.id}/manual-${kind}-${hash}.webp`
  await uploadToS3(webp, s3Key)
  const image = await db.gameImage.create({
    data: {
      gameId: game.id, kind: `manual-${kind}`, width: meta.width ?? null, height: meta.height ?? null,
      s3Key, sourceUrl: `manual:${hash}`, palette,
    },
  })
  return { image, palette }
}

/** Makes a stored image the game's banner, fanart or logo, and locks those fields as the owner's. */
export async function useAsSlot(gameId: number, slot: ManualKind, s3Key: string, palette: string | null) {
  const game = await db.game.findUnique({ where: { id: gameId }, select: { manualFields: true } })
  if (!game) throw new ArtError(404, 'Game not found')
  const data: Record<string, unknown> = { ...fieldsFor(slot, `${s3Key}?v=${Date.now()}`) }
  if (palette && slot !== 'logo') data.themePalette = palette
  data.manualFields = lockFields(game.manualFields, Object.keys(data))
  await db.game.update({ where: { id: gameId }, data })
}

/** Takes an image from the library into its place: the cover, or the banner, fanart or logo slot. */
export async function activateImage(gameId: number, imageId: number): Promise<{ coverPath?: string }> {
  const image = await db.gameImage.findFirst({ where: { id: imageId, gameId, removedAt: null } })
  if (!image) throw new ArtError(404, 'Imagen no encontrada')
  const game = await db.game.findUnique({ where: { id: gameId }, select: { metadataSources: true, platform: { select: { slug: true } } } })
  if (!game) throw new ArtError(404, 'Game not found')

  if (categoryOf(image.kind) === 'cover') {
    const key = await saveCoverFromBuffer(await getFromS3(image.s3Key), game.platform.slug, gameId)
    const sources = { ...parseMetadataSources(game.metadataSources), cover: 'launchbox' as const, coverManual: true }
    await applyMetadata(gameId, { origin: 'owner', data: { coverPath: key }, sources })
    return { coverPath: key }
  }

  const slot = slotOf(image.kind)
  if (!slot) throw new ArtError(400, 'Esta imagen no se puede usar aquí')
  let palette = image.palette
  if (!palette && slot !== 'logo') {
    palette = JSON.stringify(await paletteOf(await getFromS3(image.s3Key)))
    await db.gameImage.update({ where: { id: image.id }, data: { palette } })
  }
  await useAsSlot(gameId, slot, image.s3Key, palette)
  return {}
}

async function saveShotList(gameId: number, list: string[]) {
  await applyMetadata(gameId, { origin: 'owner', data: { screenshotPaths: list.length ? JSON.stringify(list) : null } })
}

/** Adds the owner's images to the end of the game's screenshots. Returns the new list. */
export async function addScreenshots(gameId: number, buffers: Buffer[]): Promise<string[]> {
  const game = await db.game.findUnique({ where: { id: gameId }, select: { screenshotPaths: true, platform: { select: { slug: true } } } })
  if (!game) throw new ArtError(404, 'Game not found')
  const list = parseShotList(game.screenshotPaths)
  for (const buffer of buffers) {
    const { image } = await storeManualImage({ id: gameId, platformSlug: game.platform.slug }, 'screenshot', buffer)
    list.push(image.s3Key)
  }
  await saveShotList(gameId, list)
  return list
}

/**
 * Sets the screenshots to a new list: reorder, remove, or put one back. An entry is an
 * external link or a key of an image of this game; anything else is refused. A manual
 * image taken out of the list stays in the bucket for the removal window, like the
 * other manual art, and putting it back clears that.
 */
export async function setScreenshots(gameId: number, next: string[]): Promise<string[]> {
  const game = await db.game.findUnique({ where: { id: gameId }, select: { screenshotPaths: true } })
  if (!game) throw new ArtError(404, 'Game not found')
  const current = parseShotList(game.screenshotPaths)
  const rows = await db.gameImage.findMany({ where: { gameId, kind: 'manual-screenshot' } })
  const own = new Map(rows.map(r => [r.s3Key, r]))

  const seen = new Set<string>()
  const clean: string[] = []
  for (const value of next) {
    if (typeof value !== 'string' || seen.has(value)) continue
    const row = own.get(value)
    const ok = row ? (!row.removedAt || isInWindow(row.removedAt)) : (current.includes(value) || !!parseRemoteUrl(value))
    if (!ok) throw new ArtError(400, 'Entrada no válida en la lista')
    seen.add(value)
    clean.push(value)
  }

  await saveShotList(gameId, clean)
  const removed = rows.filter(r => !r.removedAt && !clean.includes(r.s3Key) && current.includes(r.s3Key))
  const restored = rows.filter(r => r.removedAt && clean.includes(r.s3Key))
  if (removed.length) await db.gameImage.updateMany({ where: { id: { in: removed.map(r => r.id) } }, data: { removedAt: new Date() } })
  if (restored.length) await db.gameImage.updateMany({ where: { id: { in: restored.map(r => r.id) } }, data: { removedAt: null } })
  return clean
}

/** Copies the screenshots that live on another server into the bucket. Returns the new list and how many failed. */
export async function storeExternalScreenshots(gameId: number): Promise<{ list: string[]; failed: number }> {
  const game = await db.game.findUnique({ where: { id: gameId }, select: { screenshotPaths: true, platform: { select: { slug: true } } } })
  if (!game) throw new ArtError(404, 'Game not found')
  const list = parseShotList(game.screenshotPaths)

  let failed = 0
  const next: string[] = []
  for (const value of list) {
    if (!value.startsWith('http://') && !value.startsWith('https://')) { next.push(value); continue }
    try {
      const { image } = await storeManualImage({ id: gameId, platformSlug: game.platform.slug }, 'screenshot', await fetchRemoteImage(value))
      next.push(image.s3Key)
    } catch {
      failed++
      next.push(value)
    }
  }
  if (next.some((v, i) => v !== list[i])) await saveShotList(gameId, next)
  return { list: next, failed }
}
