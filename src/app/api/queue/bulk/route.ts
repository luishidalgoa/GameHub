/**
 * POST /api/queue/bulk
 * Enqueues every DLC/update/mod file of a given type for a game as
 * individual download tokens (no ZIP, no compression — plain file streaming).
 * Returns the list of tokens so the client can track them on /queue/batch.
 */
import { NextResponse } from 'next/server'
import { db }           from '@/lib/db'
import { enqueue }      from '@/lib/download-queue'
import { serializeBigInt } from '@/lib/serialize'

type DlcType = 'dlc' | 'update' | 'mod'

export async function POST(req: Request) {
  const { gameId, type } = await req.json() as { gameId?: number; type?: DlcType }
  if (!gameId || !type || !['dlc', 'update', 'mod'].includes(type)) {
    return NextResponse.json({ error: 'gameId and type (dlc|update|mod) required' }, { status: 400 })
  }

  const dlcs = await db.gameDlc.findMany({
    where:   { gameId: Number(gameId), type },
    orderBy: { fileName: 'asc' },
  })

  if (dlcs.length === 0) {
    return NextResponse.json({ error: 'No files found' }, { status: 404 })
  }

  const items = []
  for (const dlc of dlcs) {
    const entry = await enqueue(Number(gameId), dlc.id)
    items.push({
      token:    entry.token,
      dlcId:    dlc.id,
      fileName: dlc.fileName,
      fileSize: dlc.fileSize.toString(),
      status:   entry.status,
      position: entry.position,
    })
  }

  return NextResponse.json(serializeBigInt({ items }))
}
