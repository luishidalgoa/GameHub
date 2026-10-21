import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getEntry, beginDownload, markDone } from '@/lib/download-queue'
import { logDownloadStart, logDownloadComplete } from '@/lib/traffic'
import { computeSha256 } from '@/lib/hash'
import { createFileWebStream } from '@/lib/stream'
import { paceDownloadBody } from '@/lib/download-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// A full download may start from ready, or restart from done inside the window (#120).
const FULL_STATUSES = ['ready', 'done']
// A range request is only valid while the token is live: a finished token
// (done) must not serve bytes again, or one queue slot feeds many connections.
// A cut-off download ends in done and may resume inside its window (#120).
const RANGE_STATUSES = ['ready', 'downloading', 'done']

function parseRange(header: string, fileSize: number): { start: number; end: number } | null {
  const m = header.match(/bytes=(\d+)-(\d*)/)
  if (!m) return null
  const start = parseInt(m[1], 10)
  const end   = m[2] ? parseInt(m[2], 10) : fileSize - 1
  if (start > end || start >= fileSize || end >= fileSize) return null
  return { start, end }
}

function getContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  const map: Record<string, string> = {
    '.nsp': 'application/octet-stream',
    '.nsz': 'application/octet-stream',
    '.cia': 'application/octet-stream',
    '.3ds': 'application/octet-stream',
    '.nds': 'application/octet-stream',
    '.iso': 'application/octet-stream',
    '.rvz': 'application/octet-stream',
    '.wbfs': 'application/octet-stream',
    '.vpk': 'application/octet-stream',
    '.zip': 'application/zip',
  }
  return map[ext] ?? 'application/octet-stream'
}

export async function GET(req: Request, { params }: { params: { gameId: string } }) {
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
  // A range request may resume a download that already closed (status done),
  // so only the full-file start is restricted to ready.
  const allowed = isRange ? RANGE_STATUSES : FULL_STATUSES
  if (!allowed.includes(entry.status)) {
    return NextResponse.json({ error: `Invalid token status: ${entry.status}` }, { status: 409 })
  }

  const gameId = parseInt(params.gameId, 10)
  if (entry.gameId !== gameId) {
    return NextResponse.json({ error: 'Token game mismatch' }, { status: 403 })
  }

  const game = await db.game.findUnique({ where: { id: gameId } })
  if (!game || game.isHidden) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const filePath = game.filePath
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }

  const stat     = fs.statSync(filePath)
  const fileSize = stat.size
  const fileName = path.basename(filePath)

  const baseHeaders: Record<string, string> = {
    'Content-Type':        getContentType(fileName),
    'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    'Accept-Ranges':       'bytes',
    'Cache-Control':       'no-store',
  }
  if (game.sha256) {
    baseHeaders['ETag']                = `"${game.sha256}"`
    baseHeaders['X-Checksum-SHA256']   = game.sha256
  }

  // ── Range request (206 Partial Content) ──────────────────────────────────────
  if (isRange) {
    const range = parseRange(rangeHeader!, fileSize)
    if (!range) {
      return new Response(null, {
        status:  416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      })
    }

    const { start, end } = range
    const chunkSize = end - start + 1

    const logId = await logDownloadStart({
      req,
      gameId,
      fileName,
      fileSize: BigInt(chunkSize),
    })

    const readableStream = await paceDownloadBody(req, createFileWebStream(filePath, { start, end }, {
      onEnd: () => logDownloadComplete(logId),
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
      gameId,
      fileName,
      fileSize: BigInt(fileSize),
    })
  } catch (err) {
    // The slot is already taken: release it, or the queue stalls on this token.
    await markDone(token)
    throw err
  }

  const readableStream = await paceDownloadBody(req, createFileWebStream(filePath, undefined, {
    // 'close' fires on both successful completion and client abort → always
    // free the queue slot and promote the next waiting download.
    onClose: () => markDone(token),
    onEnd: () => {
      logDownloadComplete(logId)
      // Compute and cache SHA-256 lazily after first successful full download
      if (!game.sha256) {
        computeSha256(filePath)
          .then((sha256) => db.game.update({ where: { id: gameId }, data: { sha256 } }))
          .catch(() => {/* non-critical */ })
      }
    },
  }))

  return new Response(readableStream, {
    headers: {
      ...baseHeaders,
      'Content-Length': String(fileSize),
    },
  })
}
