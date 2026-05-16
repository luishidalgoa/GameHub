import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const COVERS_DIR = path.join(process.cwd(), 'public', 'covers')

export async function downloadAndCacheCover(
  imageUrl: string,
  platformSlug: string,
  gameId: number
): Promise<string> {
  const dir = path.join(COVERS_DIR, platformSlug)
  fs.mkdirSync(dir, { recursive: true })

  const fileName = `${gameId}.webp`
  const originalFileName = `${gameId}.original.webp`
  const filePath = path.join(dir, fileName)
  const originalPath = path.join(dir, originalFileName)

  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`Failed to download cover: ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())

  // Save original (unmodified) image
  await sharp(buffer)
    .resize(1200, 1800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toFile(originalPath)

  // Save as display image (same initially)
  await sharp(buffer)
    .resize(1200, 1800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toFile(filePath)

  return `/covers/${platformSlug}/${fileName}`
}

export async function saveCoverFromBuffer(
  buffer: Buffer,
  platformSlug: string,
  gameId: number
): Promise<string> {
  const dir = path.join(COVERS_DIR, platformSlug)
  fs.mkdirSync(dir, { recursive: true })

  const fileName = `${gameId}.webp`
  const originalFileName = `${gameId}.original.webp`
  const filePath = path.join(dir, fileName)
  const originalPath = path.join(dir, originalFileName)

  // Save original (unmodified) image - only if it doesn't exist
  if (!fs.existsSync(originalPath)) {
    await sharp(buffer)
      .resize(1200, 1800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 })
      .toFile(originalPath)
  }

  // Save as display image (can be modified)
  await sharp(buffer)
    .resize(1200, 1800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toFile(filePath)

  return `/covers/${platformSlug}/${fileName}`
}

export function getOriginalCoverPath(coverPath: string): string {
  // Convert /covers/platform/gameId.webp to /covers/platform/gameId.original.webp
  return coverPath.replace('.webp', '.original.webp')
}
