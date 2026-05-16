import { NextResponse } from 'next/server'
import { enqueue } from '@/lib/download-queue'

export async function POST(req: Request) {
  const { gameId, dlcId } = await req.json()
  if (!gameId) {
    return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  }

  const entry = await enqueue(Number(gameId), dlcId ? Number(dlcId) : undefined)

  const response: Record<string, unknown> = {
    token:    entry.token,
    status:   entry.status,
    position: entry.position,
  }

  return NextResponse.json(response)
}
