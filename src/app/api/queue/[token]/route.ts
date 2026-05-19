import { NextResponse }          from 'next/server'
import { getEntry }              from '@/lib/download-queue'
import { getBulkToken, isBulkToken } from '@/lib/bulk-queue'

export const dynamic = 'force-dynamic'

// GET /api/queue/[token]  → poll status; resolves redirectUrl when ready
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const { token } = params

  // ── Bulk download token (in-memory, admin-only) ────────────────────────────
  if (isBulkToken(token)) {
    const bulk = getBulkToken(token)
    if (!bulk) {
      return NextResponse.json({ error: 'Token not found or expired' }, { status: 404 })
    }
    return NextResponse.json({
      token,
      status:      'ready',
      position:    0,
      expiresAt:   bulk.expiresAt,
      redirectUrl: `/api/download/game-extras/${bulk.gameId}?type=${bulk.type}&token=${token}`,
    })
  }

  // ── Regular game/DLC download token (DB-backed) ────────────────────────────
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
