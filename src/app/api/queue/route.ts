import { NextResponse } from 'next/server'
import { enqueue } from '@/lib/download-queue'
import { shorten, buildDownloadUrl, isLocalRequest } from '@/lib/shortener'

export async function POST(req: Request) {
  const { gameId, dlcId } = await req.json()
  if (!gameId) {
    return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  }

  const isLocal = await isLocalRequest(req)
  console.log(`[queue] isLocal=${isLocal}`)
  const entry   = await enqueue(Number(gameId), dlcId ? Number(dlcId) : undefined)

  const response: Record<string, unknown> = {
    token:    entry.token,
    status:   entry.status,
    position: entry.position,
  }

  if (entry.status === 'ready' && !isLocal) {
    const directUrl = buildDownloadUrl(Number(gameId), entry.token, dlcId ? Number(dlcId) : undefined, req)
    const shortened = await shorten(directUrl)
    if (shortened) response.redirectUrl = shortened
  }

  return NextResponse.json(response)
}
