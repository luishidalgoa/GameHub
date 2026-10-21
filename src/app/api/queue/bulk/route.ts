/**
 * POST /api/queue/bulk
 * Enqueues every DLC/update/mod file of a given type for a game as
 * individual download tokens (no ZIP, no compression — plain file streaming).
 * Returns the batch id and its tokens. The batch page tracks the batch by that id
 * (GET /api/queue/batch/[batchId]), so the client keeps nothing else.
 */
import { NextResponse } from 'next/server'
import { db }           from '@/lib/db'
import { enqueueMany, newBatchId, QueueFullError } from '@/lib/download-queue'
import { serializeBigInt } from '@/lib/serialize'
import { queueCreateGuard } from '@/lib/queue-limit'

type DlcType = 'dlc' | 'update' | 'mod'

export async function POST(req: Request) {
  const limited = queueCreateGuard(req.headers)
  if (limited) return limited

  let body: { gameId?: number; type?: DlcType }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 })
  }
  const { gameId, type } = body
  if (!gameId || !type || !['dlc', 'update', 'mod'].includes(type)) {
    return NextResponse.json({ error: 'gameId and type (dlc|update|mod) required' }, { status: 400 })
  }

  try {
    const game = await db.game.findUnique({ where: { id: Number(gameId) }, select: { isHidden: true } })
    if (!game || game.isHidden) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const dlcs = await db.gameDlc.findMany({
      where:   { gameId: Number(gameId), type },
      orderBy: { fileName: 'asc' },
    })

    if (dlcs.length === 0) {
      return NextResponse.json({ error: 'No files found' }, { status: 404 })
    }

    const batchId = newBatchId()
    const entries = await enqueueMany(dlcs.map(dlc => ({ gameId: Number(gameId), dlcId: dlc.id })), batchId)
    const items = dlcs.map((dlc, i) => ({
      token:    entries[i].token,
      dlcId:    dlc.id,
      fileName: dlc.fileName,
      fileSize: dlc.fileSize.toString(),
      status:   entries[i].status,
      position: entries[i].position,
    }))

    return NextResponse.json(serializeBigInt({ batchId, items }))
  } catch (err) {
    if (err instanceof QueueFullError) {
      return NextResponse.json({ error: err.message }, { status: 429 })
    }
    console.error('[POST /api/queue/bulk] enqueue failed:', err)
    const detail = err instanceof Error ? err.message : 'error desconocido'
    return NextResponse.json(
      { error: `No se pudo encolar la descarga: ${detail}` },
      { status: 500 },
    )
  }
}
