import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getBatch, cancelBatchWaiting } from '@/lib/download-queue'

export const dynamic = 'force-dynamic'

// GET /api/queue/batch/[batchId] → every file of the batch with its status. Once a
// file is ready, its redirectUrl is included so the page can start the download.
export async function GET(_req: Request, { params }: { params: { batchId: string } }) {
  const entries = await getBatch(params.batchId)
  if (entries.length === 0) {
    return NextResponse.json({ error: 'Batch not found or expired' }, { status: 404 })
  }

  const dlcIds = entries.map(e => e.dlcId).filter((id): id is number => id !== undefined)
  const dlcs   = await db.gameDlc.findMany({
    where:  { id: { in: dlcIds } },
    select: { id: true, fileName: true, fileSize: true },
  })
  const byId = new Map(dlcs.map(d => [d.id, d]))

  const items = entries.map(e => {
    const dlc = e.dlcId !== undefined ? byId.get(e.dlcId) : undefined
    return {
      token:       e.token,
      dlcId:       e.dlcId ?? null,
      fileName:    dlc?.fileName ?? '',
      fileSize:    (dlc?.fileSize ?? BigInt(0)).toString(),
      status:      e.status,
      position:    e.position,
      redirectUrl: e.status === 'ready' ? `/api/download/dlc/${e.dlcId}?token=${e.token}` : undefined,
    }
  })
  return NextResponse.json({ items })
}

// DELETE /api/queue/batch/[batchId] → cancel the files still waiting. Files already
// ready or downloading are left alone.
export async function DELETE(_req: Request, { params }: { params: { batchId: string } }) {
  const cancelled = await cancelBatchWaiting(params.batchId)
  return NextResponse.json({ cancelled })
}
