import { createHash } from 'crypto'
import sharp from 'sharp'
import { db } from '@/lib/db'
import { uploadToS3 } from '@/lib/s3'
import { providerFetch } from '@/lib/metadata/http'
import type { LaunchBoxImage } from '@/lib/metadata/launchbox'

const MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024

/** LaunchBox's image categories, normalized to the kinds stored in GameImage.kind. */
const KINDS: [RegExp, string][] = [
  [/^banner$/, 'banner'],
  [/^fanart\s*-?\s*background$/, 'fanart'],
  [/^square$/, 'square'],
  [/^clear\s*logo$/, 'clear-logo'],
  [/^box\s*-\s*front\s*-\s*reconstructed$/, 'box-front-reconstructed'],
  [/^box\s*-\s*front$/, 'box-front'],
  [/^box\s*-\s*back$/, 'box-back'],
  [/^box\s*-\s*3d$/, 'box-3d'],
  [/^box\s*-\s*spine$/, 'box-spine'],
  [/^cart\s*-\s*front$/, 'cart-front'],
  [/^disc$/, 'disc'],
  [/^screenshot\s*-\s*gameplay$/, 'screenshot-gameplay'],
  [/^screenshot\s*-\s*game\s*title$/, 'screenshot-game-title'],
]

/** The stored kind of a LaunchBox image type: a known category, or `other` with its slug. */
export function kindOf(type: string): string {
  const t = type.trim().toLowerCase()
  for (const [re, kind] of KINDS) if (re.test(t)) return kind
  return 'other'
}

/**
 * Largest size kept for each kind. Backgrounds and screenshots keep their width
 * (they are landscape); a box keeps its long edge, so the box shape is never
 * changed. Logos stay transparent.
 */
function fit(kind: string): { width?: number; height?: number; quality: number } {
  switch (kind) {
    case 'banner':
    case 'fanart':
    case 'screenshot-gameplay':
    case 'screenshot-game-title':
      return { width: 1920, quality: 82 }
    case 'clear-logo':
      return { width: 1000, quality: 90 }
    default:
      return { width: 1200, height: 1200, quality: 86 }
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export interface StoredImage {
  key: string
  kind: string
  /** The WebP bytes, only when this run downloaded the image; null when it was already stored. */
  buffer: Buffer | null
}

/**
 * Downloads every image of a game that is not in the repository yet, converts it
 * to WebP at its category's size and stores it under repo/. Returns the stored key
 * of each source URL. An image that fails is skipped, not fatal: the others still
 * go in, and the next run tries it again.
 */
export async function storeGameImages(
  game: { id: number; platformSlug: string },
  images: LaunchBoxImage[],
  paceMs = 600,
): Promise<{ byUrl: Map<string, StoredImage>; failed: number }> {
  const byUrl = new Map<string, StoredImage>()
  let failed = 0
  if (images.length === 0) return { byUrl, failed }

  const known = await db.gameImage.findMany({
    where: { gameId: game.id, sourceUrl: { in: images.map(i => i.url) } },
    select: { sourceUrl: true, s3Key: true, kind: true },
  })
  for (const k of known) byUrl.set(k.sourceUrl, { key: k.s3Key, kind: k.kind, buffer: null })

  for (const image of images) {
    if (byUrl.has(image.url)) continue
    const kind = kindOf(image.type)
    try {
      await sleep(paceMs)
      const res = await providerFetch(image.url)
      if (!res.ok) throw new Error(`image ${res.status}`)
      const raw = Buffer.from(await res.arrayBuffer())
      if (raw.length > MAX_DOWNLOAD_BYTES) throw new Error('image too large')
      const { width, height, quality } = fit(kind)
      const webp = await sharp(raw)
        .resize({ width, height, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, alphaQuality: 95 })
        .toBuffer()
      const meta = await sharp(webp).metadata()
      const hash = createHash('sha1').update(image.url).digest('hex').slice(0, 8)
      const key = `repo/${game.platformSlug}/${game.id}/${kind}-${hash}.webp`
      await uploadToS3(webp, key)
      await db.gameImage.create({
        data: {
          gameId: game.id, kind, region: image.region ?? null,
          width: meta.width ?? null, height: meta.height ?? null,
          s3Key: key, sourceUrl: image.url,
        },
      })
      byUrl.set(image.url, { key, kind, buffer: webp })
    } catch {
      failed++
    }
  }
  return { byUrl, failed }
}
