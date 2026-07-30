import sharp from 'sharp'
import { uploadCoverToS3 } from './s3'
import { db } from './db'

const S3_PREFIX = 'covers'

/**
 * Longest edge of a stored cover. The other edge follows the platform's own
 * aspect, so the box keeps its real shape instead of being letterboxed into a
 * single canvas.
 */
const COVER_LONG_EDGE = 1200

/** Fallback shape when the platform has no thumbnail size — the old 2:3 canvas. */
const DEFAULT_RATIO = 200 / 300

/**
 * Pixel size to store a cover at for a platform, honouring the aspect its own
 * `thumbnailWidth`/`thumbnailHeight` already declare.
 *
 * Everything used to be resized to a hardcoded 1200x1800. Nothing was distorted
 * — `fit: 'contain'` pads rather than stretches — but a square Game Boy Advance
 * box ended up floating in a tall poster with transparent bands down both
 * sides, and a landscape PAL SNES box in an even worse one. The platform table
 * has carried the right proportions all along; they were only ever used for CSS.
 */
async function coverSize(platformSlug: string): Promise<{ width: number; height: number }> {
  let ratio = DEFAULT_RATIO
  try {
    const platform = await db.platform.findUnique({
      where:  { slug: platformSlug },
      select: { thumbnailWidth: true, thumbnailHeight: true },
    })
    if (platform?.thumbnailWidth && platform?.thumbnailHeight) {
      ratio = platform.thumbnailWidth / platform.thumbnailHeight
    }
  } catch {
    // A cover is not worth failing over a DB hiccup; fall back to the old shape.
  }
  return ratio >= 1
    ? { width: COVER_LONG_EDGE, height: Math.round(COVER_LONG_EDGE / ratio) }
    : { width: Math.round(COVER_LONG_EDGE * ratio), height: COVER_LONG_EDGE }
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

  const { width, height } = await coverSize(platformSlug)
  const processed = await sharp(buffer)
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toBuffer()

  await uploadCoverToS3(processed, s3Key, originalKey, undefined, replaceOriginal)

  // Append a version timestamp so the stored DB key changes on every upload.
  // resolveCoverPath() forwards this as a query param in the proxy URL, which
  // busts any browser / CDN cache without changing the actual MinIO object key.
  return `${s3Key}?v=${Date.now()}`
}

/** Convert a display key/URL to its .original counterpart. */
export function getOriginalCoverPath(coverPath: string): string {
  return coverPath.replace(/\.webp(\?.*)?$/, '.original.webp')
}
