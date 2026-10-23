import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { fetchRemoteImage } from '@/lib/remote-image'
import { saveCharacter, saveLogo } from '@/lib/publisher-art'

export const dynamic = 'force-dynamic'

// POST { key, name, kind: 'character' | 'logo', url } — descarga la imagen elegida y la guarda
// como personaje o como logo de la editora, igual que si se hubiera subido a mano.
export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const body = await req.json().catch(() => ({})) as { key?: unknown; name?: unknown; kind?: unknown; url?: unknown }
  if (typeof body.key !== 'string' || typeof body.name !== 'string' || typeof body.url !== 'string') {
    return NextResponse.json({ error: 'key, name y url son obligatorios' }, { status: 400 })
  }
  if (body.kind !== 'character' && body.kind !== 'logo') {
    return NextResponse.json({ error: 'kind debe ser character o logo' }, { status: 400 })
  }
  try {
    const image = await fetchRemoteImage(body.url)
    const art = body.kind === 'character'
      ? await saveCharacter(body.key, image)
      : await saveLogo(body.key, body.name, image)
    return NextResponse.json({ art })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo importar la imagen' }, { status: 422 })
  }
}
