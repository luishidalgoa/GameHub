import { NextResponse } from 'next/server'
import { getEntry } from '@/lib/download-queue'
import { shorten, buildDownloadUrl, isLocalRequest } from '@/lib/shortener'

export const dynamic = 'force-dynamic'

// GET /api/queue/[token]  → poll status; resolves redirectUrl when ready
export async function GET(req: Request, { params }: { params: { token: string } }) {
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
    const isLocal = await isLocalRequest(req)

    if (isLocal) {
      responseData.redirectUrl = entry.dlcId
        ? `/api/download/dlc/${entry.dlcId}?token=${token}`
        : `/api/download/${entry.gameId}?token=${token}`
    } else {
      const directUrl = buildDownloadUrl(entry.gameId, token, entry.dlcId, req)
      const shortened = await shorten(directUrl)
      if (shortened) {
        responseData.redirectUrl = shortened
      } else {
        responseData.shortenerPending = true
      }
    }
  }

  return NextResponse.json(responseData)
}
