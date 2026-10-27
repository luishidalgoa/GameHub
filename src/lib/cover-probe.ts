import sharp from 'sharp'

/** A cover candidate's pixels, read before anything is stored: the quality check needs them. */
export interface CoverProbe {
  buffer: Buffer
  width: number
  height: number
}

const TIMEOUT_MS = 15_000

/**
 * Downloads a cover candidate and reads its size. The buffer is kept: when the candidate
 * is chosen, it is stored from these bytes, so the image is not downloaded twice.
 * Null when the image cannot be fetched or is not an image.
 */
export async function probeCoverImage(imageUrl: string): Promise<CoverProbe | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    const meta = await sharp(buffer).metadata()
    if (!meta.width || !meta.height) return null
    return { buffer, width: meta.width, height: meta.height }
  } catch {
    return null
  }
}
