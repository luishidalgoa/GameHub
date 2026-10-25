import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { libraryGameWhere } from '@/lib/library'
import { libraryTitleIds, libraryTitleKeys } from '@/lib/external/match'
import { SWITCH_GAMES_SOURCE } from '@/lib/external/switch-games'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 48

// Torrents de una plataforma que la biblioteca no tiene: lo que aún no se puede descargar de la casa.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const slug = sp.get('platform') ?? ''
  const search = (sp.get('search') ?? '').trim().slice(0, 100)
  const page = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1)

  const platform = await db.platform.findUnique({ where: { slug }, select: { id: true } })
  if (!platform) return NextResponse.json({ games: [], total: 0, page, pageSize: PAGE_SIZE })

  const library = await db.game.findMany({
    where: libraryGameWhere(slug),
    select: { title: true, fileName: true, titleId: true },
  })
  const owned = [...libraryTitleIds(library)]
  const ownedKeys = [...libraryTitleKeys(library)]
  const where = {
    platformId: platform.id,
    source: SWITCH_GAMES_SOURCE,
    ...(search && { title: { contains: search } }),
    // Un NOT IN con NULL no casa nada en SQL: los torrents sin Title ID o sin clave se quedan siempre.
    ...(owned.length > 0 && { OR: [{ titleId: null }, { titleId: { notIn: owned } }] }),
    ...(ownedKeys.length > 0 && { titleKey: { notIn: ownedKeys } }),
  }

  const [rows, total] = await Promise.all([
    db.externalGame.findMany({
      where,
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, title: true, size: true, format: true, hasDlc: true, cover: true,
        year: true, genre: true, developer: true, magnet: true, sourceUrl: true,
      },
    }),
    db.externalGame.count({ where }),
  ])

  return NextResponse.json({ games: rows, total, page, pageSize: PAGE_SIZE })
}
