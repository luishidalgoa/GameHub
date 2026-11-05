import { adminGuard } from '@/lib/admin-guard'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { uploadToS3, deleteFromS3, resolveCoverPath } from '@/lib/s3'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BYTES = 50 * 1024 * 1024
const modelKey = (slug: string) => `models/${slug}.glb`

// POST multipart { platformId, file } → guarda el GLB en MinIO y lo pone en Platform.modelPath.
// Se valida la cabecera binaria («glTF»), no la extensión.
export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  try {
    const form = await req.formData()
    const platformId = parseInt(form.get('platformId') as string, 10)
    const file = form.get('file') as File | null
    if (!platformId || !file) {
      return NextResponse.json({ error: 'platformId and file are required' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'el modelo pasa de 50 MB' }, { status: 413 })
    }

    const platform = await db.platform.findUnique({ where: { id: platformId }, select: { slug: true } })
    if (!platform) return NextResponse.json({ error: 'Platform not found' }, { status: 404 })

    const input = Buffer.from(await file.arrayBuffer())
    if (input.subarray(0, 4).toString('ascii') !== 'glTF') {
      return NextResponse.json({ error: 'el archivo no es un GLB válido' }, { status: 400 })
    }

    const key = modelKey(platform.slug)
    await uploadToS3(input, key, 'model/gltf-binary')

    // Cache-bust: la clave es fija y el ?v= cambia con cada subida.
    const modelPath = `${key}?v=${Date.now()}`
    await db.platform.update({ where: { id: platformId }, data: { modelPath } })

    return NextResponse.json({ modelPath, resolved: resolveCoverPath(modelPath) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE { platformId } → quita el modelo subido; vuelve al de fábrica si lo hay.
export async function DELETE(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  try {
    const { platformId } = await req.json().catch(() => ({}))
    if (!platformId) return NextResponse.json({ error: 'platformId required' }, { status: 400 })

    const platform = await db.platform.findUnique({ where: { id: platformId }, select: { slug: true, modelPath: true } })
    if (!platform) return NextResponse.json({ error: 'Platform not found' }, { status: 404 })

    if (platform.modelPath) await deleteFromS3(modelKey(platform.slug))
    await db.platform.update({ where: { id: platformId }, data: { modelPath: null } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
