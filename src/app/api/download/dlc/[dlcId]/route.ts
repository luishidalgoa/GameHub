import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getEntry, markDownloading, markDone } from '@/lib/download-queue'
import { logDownloadStart, logDownloadComplete } from '@/lib/traffic'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function parseRange(header: string, fileSize: number): { start: number; end: number } | null {
  const m = header.match(/bytes=(\d+)-(\d*)/)
  if (!m) return null
  const start = parseInt(m[1], 10)
  const end   = m[2] ? parseInt(m[2], 10) : fileSize - 1
  if (start > end || start >= fileSize || end >= fileSize) return null
  return { start, end }
}

export async function GET(req: Request, { params }: { params: { dlcId: string } }) {
  const { searchParams } = new URL(req.url)
  const token      = searchParams.get('token')
  const rangeHeader = req.headers.get('range')
  const isRange    = !!rangeHeader

  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const entry = await getEntry(token)
  if (!entry) return NextResponse.json({ error: 'Token not found or expired' }, { status: 404 })

  if (!isRange) {
    if (entry.status === 'waiting') {
      return NextResponse.json({ error: 'Not your turn yet', position: entry.position }, { status: 425 })
    }
    if (entry.status !== 'ready') {
      return NextResponse.json({ error: `Invalid token status: ${entry.status}` }, { status: 409 })
    }
  }

  const dlcId = parseInt(params.dlcId, 10)
  if (entry.dlcId !== dlcId) {
    return NextResponse.json({ error: 'Token DLC mismatch' }, { status: 403 })
  }

  const dlc = await db.gameDlc.findUnique({ where: { id: dlcId } })
  if (!dlc) return NextResponse.json({ error: 'DLC not found' }, { status: 404 })

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
      gameId: dlc.gameId,
      dlcId,
      dlcType: dlc.type,
      fileName,
      fileSize: BigInt(chunkSize),
    })

    const fileStream     = fs.createReadStream(filePath, { start, end })
    const readableStream = new ReadableStream({
      start(controller) {
        fileStream.on('data',  (chunk) => controller.enqueue(chunk))
        fileStream.on('end',   ()      => { controller.close(); logDownloadComplete(logId) })
        fileStream.on('error', (err)   => controller.error(err))
      },
      cancel() { fileStream.destroy() },
    })

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
  if (!(await markDownloading(token))) {
    return NextResponse.json({ error: 'Token already in use' }, { status: 409 })
  }

  const logId = await logDownloadStart({
    req,
    gameId: dlc.gameId,
    dlcId,
    dlcType: dlc.type,
    fileName,
    fileSize: BigInt(fileSize),
  })

  const fileStream     = fs.createReadStream(filePath)
  const readableStream = new ReadableStream({
    start(controller) {
      fileStream.on('data',  (chunk) => controller.enqueue(chunk))
      fileStream.on('end',   ()      => { controller.close(); markDone(token); logDownloadComplete(logId) })
      fileStream.on('error', (err)   => { controller.error(err); markDone(token) })
    },
    cancel() { fileStream.destroy(); markDone(token) },
  })

  return new Response(readableStream, {
    headers: {
      ...baseHeaders,
      'Content-Length': String(fileSize),
    },
  })
}
