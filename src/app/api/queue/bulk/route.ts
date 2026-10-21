/**
 * POST /api/queue/bulk
 * Enqueues every DLC/update/mod file of a given type for a game as
 * individual download tokens (no ZIP, no compression — plain file streaming).
 * Returns the list of tokens so the client can track them on /queue/batch.
 */
import { NextResponse } from 'next/server'
import { db }           from '@/lib/db'
import { enqueue, QueueFullError, MAX_WAITING } from '@/lib/download-queue'
import { serializeBigInt } from '@/lib/serialize'

type DlcType = 'dlc' | 'update' | 'mod'

export async function POST(req: Request) {
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

    // Check room for the whole batch first: a 429 halfway would leave tokens the
    // client never receives.
    const waiting = await db.downloadToken.count({ where: { status: 'waiting' } })
    if (waiting + dlcs.length > MAX_WAITING) {
      return NextResponse.json(
        { error: 'La cola de espera no tiene sitio para todo el lote. Inténtalo más tarde.' },
        { status: 429 },
      )
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
