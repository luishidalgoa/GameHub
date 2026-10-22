import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { ArtError, addScreenshots, setScreenshots } from '@/lib/game-art'
import { fetchRemoteImage } from '@/lib/remote-image'

export const dynamic = 'force-dynamic'

const MAX_UPLOAD = 15 * 1024 * 1024
const MAX_PER_REQUEST = 12

// POST multipart { file: File[] } and/or { url: string[] } — adds images to the end of the screenshots.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'multipart form required' }, { status: 400 })

  const files = form.getAll('file').filter((f): f is File => f instanceof File)
  const urls = form.getAll('url').filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
  if (files.length + urls.length === 0) return NextResponse.json({ error: 'No hay imágenes' }, { status: 400 })
  if (files.length + urls.length > MAX_PER_REQUEST) return NextResponse.json({ error: `Como mucho ${MAX_PER_REQUEST} a la vez` }, { status: 400 })
  if (files.some(f => f.size > MAX_UPLOAD)) return NextResponse.json({ error: 'file too large' }, { status: 413 })

  try {
    const buffers = [
      ...await Promise.all(files.map(async f => Buffer.from(await f.arrayBuffer()))),
      ...await Promise.all(urls.map(u => fetchRemoteImage(u))),
    ]
    return NextResponse.json({ list: await addScreenshots(parseInt(params.id, 10), buffers) })
  } catch (e) {
    if (e instanceof ArtError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo añadir' }, { status: 400 })
  }
}

// PUT { list: string[] } — sets the order and what stays: reorder, remove, or put one back.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const denied = await adminGuard()
  if (denied) return denied
  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.list)) return NextResponse.json({ error: 'list is required' }, { status: 400 })
  try {
    return NextResponse.json({ list: await setScreenshots(parseInt(params.id, 10), body.list) })
  } catch (e) {
    if (e instanceof ArtError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
