import { adminGuard } from '@/lib/admin-guard'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { uploadToS3, resolveCoverPath } from '@/lib/s3'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BYTES = 4 * 1024 * 1024
const posterKey = (slug: string) => `posters/${slug}.png`

// POST multipart { platformId, file } → PNG frontal del modelo en MinIO; Platform.posterPath.
// Se valida la cabecera PNG, no la extensión.
export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  try {
    const form = await req.formData()
    const platformId = parseInt(form.get('platformId') as string, 10)
    const file = form.get('file') as Blob | null
    if (!platformId || !file) {
      return NextResponse.json({ error: 'platformId and file are required' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'el póster pasa de 4 MB' }, { status: 413 })
    }

    const platform = await db.platform.findUnique({ where: { id: platformId }, select: { slug: true } })
    if (!platform) return NextResponse.json({ error: 'Platform not found' }, { status: 404 })

    const input = Buffer.from(await file.arrayBuffer())
    if (input.subarray(0, 4).toString('hex') !== '89504e47') {
      return NextResponse.json({ error: 'el póster tiene que ser un PNG' }, { status: 400 })
    }

    const key = posterKey(platform.slug)
    await uploadToS3(input, key, 'image/png')
    const posterPath = `${key}?v=${Date.now()}`
    await db.platform.update({ where: { id: platformId }, data: { posterPath } })
    return NextResponse.json({ posterPath, resolved: resolveCoverPath(posterPath) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
