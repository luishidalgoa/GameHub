import sharp from 'sharp'
import { uploadCoverToS3 } from './s3'
import { db } from './db'

const S3_PREFIX = 'covers'

/**
 * Longest edge of a stored cover. The image keeps its own shape: nothing is padded
 * into a canvas of the platform's ratio. Art that is not a box (a banner, a square,
 * a logo) stays what it is, and the card shows it as art instead of as a box.
 */
const COVER_LONG_EDGE = 1200

/**
 * Resize a cover to the stored size without padding, and report its own proportion
 * (width / height), or null when the image cannot be read.
 */
export async function processCover(buffer: Buffer): Promise<{ webp: Buffer; ratio: number | null; width: number | null; height: number | null }> {
  const meta = await sharp(buffer).metadata()
  const ratio = meta.width && meta.height ? meta.width / meta.height : null
  const webp = await sharp(buffer)
    .resize(COVER_LONG_EDGE, COVER_LONG_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer()
  // The size of the picture as it came in: the quality of a cover is judged on this.
  return { webp, ratio, width: meta.width ?? null, height: meta.height ?? null }
}

/**
 * The part of a stored image that is not transparent padding. Covers saved before
 * this change were padded into the platform's canvas; trimming gives back the art.
 * An image with no padding comes back unchanged.
 */
export async function trimTransparent(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return buffer
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  if (w * h > width * height * 0.98) return buffer
  return sharp(buffer).extract({ left: minX, top: minY, width: w, height: h }).toBuffer()
}

export async function downloadAndCacheCover(
  imageUrl:     string,
  platformSlug: string,
  gameId:       number,
): Promise<string> {
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`Failed to download cover: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  return saveCoverFromBuffer(buffer, platformSlug, gameId)
}

export async function saveCoverFromBuffer(
  buffer:          Buffer,
  platformSlug:    string,
  gameId:          number,
  /** When true (default), replace the stored original so the crop tool sees the
   *  freshest source.  Pass false for crop-adjustment re-uploads. */
  replaceOriginal  = true,
): Promise<string> {
  const s3Key       = `${S3_PREFIX}/${platformSlug}/${gameId}.webp`
  const originalKey = `${S3_PREFIX}/${platformSlug}/${gameId}.original.webp`

  const { webp, ratio, width, height } = await processCover(buffer)
  await uploadCoverToS3(webp, s3Key, originalKey, undefined, replaceOriginal)
  await db.game.update({ where: { id: gameId }, data: { coverRatio: ratio, coverWidth: width, coverHeight: height } }).catch(() => {})

  // Append a version timestamp so the stored DB key changes on every upload.
  // resolveCoverPath() forwards this as a query param in the proxy URL, which
  // busts any browser / CDN cache without changing the actual MinIO object key.
  return `${s3Key}?v=${Date.now()}`
}

/** Convert a display key/URL to its .original counterpart. */
export function getOriginalCoverPath(coverPath: string): string {
  return coverPath.replace(/\.webp(\?.*)?$/, '.original.webp')
}
