/**
 * GET /api/platform-extras/[slug]
 * Returns counts and total sizes of DLC / update / mod files for a platform.
 * Admin session required.
 */
import { NextResponse }   from 'next/server'
import { db }             from '@/lib/db'
import { isAdminSession } from '@/lib/auth'
import { serializeBigInt } from '@/lib/serialize'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
) {
  if (!await isAdminSession()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const platform = await db.platform.findUnique({ where: { slug: params.slug } })
  if (!platform) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [dlcs, updates, mods] = await Promise.all(
    (['dlc', 'update', 'mod'] as const).map(type =>
      db.gameDlc.aggregate({
        where: { type, game: { platformId: platform.id, isHidden: false } },
        _count: { id: true },
        _sum:   { fileSize: true },
      })
    )
  )

  return NextResponse.json(serializeBigInt({
    dlc:    { count: dlcs._count.id,    totalSize: dlcs._sum.fileSize    ?? BigInt(0) },
    update: { count: updates._count.id, totalSize: updates._sum.fileSize ?? BigInt(0) },
    mod:    { count: mods._count.id,    totalSize: mods._sum.fileSize    ?? BigInt(0) },
  }))
}
