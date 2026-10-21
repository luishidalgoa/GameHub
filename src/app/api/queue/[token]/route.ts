import { NextResponse } from 'next/server'
import { getEntry, cancelWaiting } from '@/lib/download-queue'

export const dynamic = 'force-dynamic'

// DELETE /api/queue/[token] → leave the queue. Only a token still waiting can be cancelled.
export async function DELETE(_req: Request, { params }: { params: { token: string } }) {
  const cancelled = await cancelWaiting(params.token)
  if (!cancelled) {
    return NextResponse.json({ error: 'Token not waiting or not found' }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}

// GET /api/queue/[token]  → poll status; resolves redirectUrl when ready
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const { token } = params

  let entry
  try {
    entry = await getEntry(token)
  } catch (err) {
    console.error('[GET /api/queue/token] getEntry failed:', err)
    return NextResponse.json({ error: 'Internal error', detail: String(err) }, { status: 500 })
  }

  if (!entry) {
    return NextResponse.json({ error: 'Token not found or expired' }, { status: 404 })
  }

  const responseData: Record<string, unknown> = {
    token:     entry.token,
    status:    entry.status,
    position:  entry.position,
    expiresAt: entry.expiresAt,
    gameId:    entry.gameId,
    dlcId:     entry.dlcId,
  }

  if (entry.status === 'ready') {
    responseData.redirectUrl = entry.dlcId
      ? `/api/download/dlc/${entry.dlcId}?token=${token}`
      : `/api/download/${entry.gameId}?token=${token}`
  }

  return NextResponse.json(responseData)
}
