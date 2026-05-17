import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''

  const [games, platforms] = await Promise.all([
    q.length > 0
      ? db.game.findMany({
          where: { isHidden: false, title: { contains: q } },
          orderBy: { sortTitle: 'asc' },
          take: 8,
          select: {
            id: true,
            title: true,
            coverPath: true,
            coverUrl: true,
            releaseYear: true,
            platform: { select: { name: true, slug: true } },
          },
        })
      : [],
    db.platform.findMany({
      where: {
        enabled: true,
        ...(q.length > 0 && { name: { contains: q } }),
      },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { games: { where: { isHidden: false } } } },
      },
    }),
  ])

  return NextResponse.json({ games, platforms })
}
