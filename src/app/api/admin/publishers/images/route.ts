import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { ImageSearchError, searchImages } from '@/lib/image-search'

export const dynamic = 'force-dynamic'

// GET ?q= — imágenes para el arte de una editora. Solo administradores.
export async function GET(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ error: 'Escribe al menos 2 letras.' }, { status: 400 })
  try {
    return NextResponse.json({ results: await searchImages(q) })
  } catch (err) {
    if (err instanceof ImageSearchError && err.code === 'no-key') {
      return NextResponse.json({ error: 'Falta la clave BRAVE_SEARCH_API_KEY en la configuración del servidor.', code: 'no-key' }, { status: 503 })
    }
    return NextResponse.json({ error: 'No se pudo buscar imágenes ahora mismo.' }, { status: 502 })
  }
}
