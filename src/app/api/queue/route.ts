import { NextResponse } from 'next/server'
import { enqueue } from '@/lib/download-queue'

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

  try {
    const entry = await enqueue(gameId, dlcId)
    return NextResponse.json({
      token:    entry.token,
      status:   entry.status,
      position: entry.position,
    })
  } catch (err) {
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
