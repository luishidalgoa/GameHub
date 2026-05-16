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
  const filePath = path.join(dir, fileName)

  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`Failed to download cover: ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())

  await sharp(buffer)
    .resize(400, 600, { fit: 'cover', position: 'center' })
    .webp({ quality: 85 })
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
  const filePath = path.join(dir, fileName)

  await sharp(buffer)
    .resize(400, 600, { fit: 'cover', position: 'center' })
    .webp({ quality: 85 })
    .toFile(filePath)

  return `/covers/${platformSlug}/${fileName}`
}
