import { NextResponse } from 'next/server'
import { enqueue, QueueFullError } from '@/lib/download-queue'
import { db } from '@/lib/db'

export async function POST(req: Request) {
  let body: { gameId?: unknown; dlcId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 })
  }

  const gameId = Number(body.gameId)
  if (!Number.isInteger(gameId) || gameId <= 0) {
    return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  }
  const dlcId = body.dlcId != null ? Number(body.dlcId) : undefined

  const game = await db.game.findUnique({ where: { id: gameId }, select: { isHidden: true } })
  if (!game || game.isHidden) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  try {
    const entry = await enqueue(gameId, dlcId)
    return NextResponse.json({
      token:    entry.token,
      status:   entry.status,
      position: entry.position,
    })
  } catch (err) {
    if (err instanceof QueueFullError) {
      return NextResponse.json({ error: err.message }, { status: 429 })
    }
    // Without this the route returned an opaque 500 → the client only saw the
    // generic "Failed to queue download". Surface the real cause (and log it).
    console.error('[POST /api/queue] enqueue failed:', err)
    const detail = err instanceof Error ? err.message : 'error desconocido'
    return NextResponse.json(
      { error: `No se pudo encolar la descarga: ${detail}` },
      { status: 500 },
    )
  }
}
