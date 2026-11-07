import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-guard'
import { quotaGuard } from '@/lib/quota'
import { IMAGE_ADAPTERS, type ImageContext } from '@/lib/providers/images'
import { IMAGE_SLOTS, IMAGE_SOURCES, IMAGE_SOURCE_SLOTS, type ImageSlot, type ImageSourceId } from '@/lib/providers/catalog'

export const dynamic = 'force-dynamic'

// Búsqueda de imágenes de cualquier fuente, para cualquier hueco. Un solo endpoint: el buscador de
// cada hueco llama aquí con la fuente de su pestaña.
//   GET ?provider=launchbox&slot=banner&q=<texto>&gameId=<id>   → { matches: [...] }
//   GET ?provider=launchbox&slot=banner&id=<id>&gameId=<id>      → { images: [...] }
// La plataforma sale del juego (gameId); sin juego, se pasa platform=<slug>.
export async function GET(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  const sp = new URL(req.url).searchParams
  const provider = sp.get('provider')
  const slot = sp.get('slot')
  if (!(IMAGE_SOURCES as readonly string[]).includes(provider ?? '') || !(IMAGE_SLOTS as readonly string[]).includes(slot ?? '')) {
    return NextResponse.json({ error: 'Unknown provider or slot' }, { status: 400 })
  }
  const source = provider as ImageSourceId
  const hole = slot as ImageSlot
  if (!IMAGE_SOURCE_SLOTS[source].includes(hole)) {
    return NextResponse.json({ error: `${source} no tiene ${hole}` }, { status: 400 })
  }

  const limited = quotaGuard(req.headers, `covers-${source}`)
  if (limited) return limited

  try {
    const gameId = Number(sp.get('gameId'))
    const game = Number.isFinite(gameId) && gameId > 0
      ? await db.game.findUnique({ where: { id: gameId }, select: { title: true, fileName: true, platform: { select: { slug: true } } } })
      : null
    const platformSlug = game?.platform.slug ?? sp.get('platform')?.trim()
    if (!platformSlug) return NextResponse.json({ error: 'Missing gameId or platform' }, { status: 400 })
    const ctx: ImageContext = { platformSlug, title: game?.title ?? '', fileName: game?.fileName ?? null }

    const adapter = IMAGE_ADAPTERS[source]
    const id = sp.get('id')
    if (id) return NextResponse.json({ images: await adapter.images(id, hole, ctx) })

    const q = sp.get('q')?.trim() ?? ''
    if (!q) return NextResponse.json({ error: 'Missing q or id' }, { status: 400 })
    return NextResponse.json({ matches: await adapter.search(q, hole, ctx) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
