import { NextResponse }    from 'next/server'
import { createBulkToken } from '@/lib/bulk-queue'
import type { BulkType }   from '@/lib/bulk-queue'

export async function POST(req: Request) {
  // Bulk ZIP downloads are available to any authenticated user with a valid
  // session — same access level as individual DLC downloads.
  const { gameId, type } = await req.json() as { gameId?: number; type?: BulkType }
  if (!gameId || !type || !['dlc', 'update', 'mod'].includes(type)) {
    return NextResponse.json({ error: 'gameId and type (dlc|update|mod) required' }, { status: 400 })
  }

  const entry = createBulkToken(Number(gameId), type)
  return NextResponse.json({ token: entry.token, status: 'ready' })
}
