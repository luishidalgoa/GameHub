import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getEntry, beginDownload, markDone } from '@/lib/download-queue'
import { logDownloadStart, logDownloadComplete } from '@/lib/traffic'
import { createFileWebStream } from '@/lib/stream'
import { paceDownloadBody } from '@/lib/download-limit'
import { parseByteRange } from '@/lib/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// A full download may start from ready, or restart from done inside the window (#120).
const FULL_STATUSES = ['ready', 'done']
// A range request is only valid while the token is live: a finished token
// (done) must not serve bytes again, or one queue slot feeds many connections.
// A cut-off download ends in done and may resume inside its window (#120).
const RANGE_STATUSES = ['ready', 'downloading', 'done']


export async function GET(req: Request, { params }: { params: { dlcId: string } }) {
  const { searchParams } = new URL(req.url)
  const token      = searchParams.get('token')
  const rangeHeader = req.headers.get('range')
  const isRange    = !!rangeHeader

  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const entry = await getEntry(token)
  if (!entry) return NextResponse.json({ error: 'Token not found or expired' }, { status: 404 })

  if (entry.status === 'waiting') {
    return NextResponse.json({ error: 'Not your turn yet', position: entry.position }, { status: 425 })
  }
  const allowed = isRange ? RANGE_STATUSES : FULL_STATUSES
  if (!allowed.includes(entry.status)) {
    return NextResponse.json({ error: `Invalid token status: ${entry.status}` }, { status: 409 })
  }

  const dlcId = parseInt(params.dlcId, 10)
  if (entry.dlcId !== dlcId) {
    return NextResponse.json({ error: 'Token DLC mismatch' }, { status: 403 })
  }

  const dlc = await db.gameDlc.findUnique({ where: { id: dlcId } })
  if (!dlc) return NextResponse.json({ error: 'DLC not found' }, { status: 404 })
  const parent = await db.game.findUnique({ where: { id: dlc.gameId }, select: { isHidden: true } })
  if (!parent || parent.isHidden) return NextResponse.json({ error: 'DLC not found' }, { status: 404 })

  const filePath = dlc.filePath
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }

  const stat     = fs.statSync(filePath)
  const fileSize = stat.size
  const fileName = path.basename(filePath)

  const baseHeaders: Record<string, string> = {
    'Content-Type':        'application/octet-stream',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    'Accept-Ranges':       'bytes',
    'Cache-Control':       'no-store',
  }

  // ── Range request (206 Partial Content) ──────────────────────────────────────
  if (isRange) {
    const range = parseByteRange(rangeHeader, fileSize)
    if (!range || range === 'unsatisfiable') {
      return new Response(null, {
        status:  416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      })
    }

    const { start, end } = range
    const chunkSize = end - start + 1

    // One download is one session, not one row per range (#89): only the request
    // that starts the file is counted; the other ranges belong to the same session.
    const logId = start === 0 ? await logDownloadStart({
      req,
      gameId: dlc.gameId,
      dlcId,
      dlcType: dlc.type,
      fileName,
      fileSize: BigInt(chunkSize),
    }) : null

    const readableStream = await paceDownloadBody(req, createFileWebStream(filePath, { start, end }, {
      onEnd: () => { if (logId !== null) logDownloadComplete(logId) },
    }))

    return new Response(readableStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': String(chunkSize),
      },
    })
  }

  // ── Full file (200 OK) ────────────────────────────────────────────────────────
  if (!(await beginDownload(token))) {
    return NextResponse.json({ error: 'Token already in use or expired' }, { status: 409 })
  }

  let logId: number
  try {
    logId = await logDownloadStart({
      req,
      gameId: dlc.gameId,
      dlcId,
      dlcType: dlc.type,
      fileName,
      fileSize: BigInt(fileSize),
    })
  } catch (err) {
    // The slot is already taken: release it, or the queue stalls on this token.
    await markDone(token)
    throw err
  }

  const readableStream = await paceDownloadBody(req, createFileWebStream(filePath, undefined, {
    onClose: () => markDone(token),
    onEnd: () => logDownloadComplete(logId),
  }))

  return new Response(readableStream, {
    headers: {
      ...baseHeaders,
      'Content-Length': String(fileSize),
    },
  })
}
