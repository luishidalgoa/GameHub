import sharp from 'sharp'
import { uploadCoverToS3 } from './s3'

const S3_PREFIX = 'covers'

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

  const processed = await sharp(buffer)
    .resize(1200, 1800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
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
