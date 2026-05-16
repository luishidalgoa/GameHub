import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getEntry, markDownloading, markDone } from '@/lib/download-queue'
import { logDownloadStart, logDownloadComplete } from '@/lib/traffic'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: { gameId: string } }) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }

  const entry = await getEntry(token)
  if (!entry) {
    return NextResponse.json({ error: 'Token not found or expired' }, { status: 404 })
  }
  if (entry.status === 'waiting') {
    return NextResponse.json({ error: 'Not your turn yet', position: entry.position }, { status: 425 })
  }
  if (entry.status !== 'ready') {
    return NextResponse.json({ error: `Invalid token status: ${entry.status}` }, { status: 409 })
  }

  const gameId = parseInt(params.gameId, 10)
  const game = await db.game.findUnique({ where: { id: gameId } })
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const filePath = game.filePath
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }

  // Prevent path traversal
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(path.resolve('F:\\'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const stat = fs.statSync(filePath)
  const fileName = path.basename(filePath)

  if (!(await markDownloading(token))) {
    return NextResponse.json({ error: 'Token already in use' }, { status: 409 })
  }

  const logId = await logDownloadStart({
    req,
    gameId,
    fileName,
    fileSize: BigInt(stat.size),
  })

  const fileStream = fs.createReadStream(filePath)

  const readableStream = new ReadableStream({
    start(controller) {
      fileStream.on('data', (chunk) => controller.enqueue(chunk))
      fileStream.on('end', () => {
        controller.close()
        markDone(token)
        logDownloadComplete(logId)
      })
      fileStream.on('error', (err) => {
        controller.error(err)
        markDone(token)
      })
    },
    cancel() {
      fileStream.destroy()
      markDone(token)
    },
  })

  const contentType = getContentType(fileName)

  return new Response(readableStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Content-Length': String(stat.size),
      'Cache-Control': 'no-store',
    },
  })
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
