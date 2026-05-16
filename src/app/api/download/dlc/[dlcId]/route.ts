import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getEntry, markDownloading, markDone } from '@/lib/download-queue'
import { logDownloadStart, logDownloadComplete } from '@/lib/traffic'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: { dlcId: string } }) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const entry = await getEntry(token)
  if (!entry) return NextResponse.json({ error: 'Token not found or expired' }, { status: 404 })
  if (entry.status === 'waiting') {
    return NextResponse.json({ error: 'Not your turn yet', position: entry.position }, { status: 425 })
  }
  if (entry.status !== 'ready') {
    return NextResponse.json({ error: `Invalid token status: ${entry.status}` }, { status: 409 })
  }

  const dlcId = parseInt(params.dlcId, 10)
  const dlc = await db.gameDlc.findUnique({ where: { id: dlcId } })
  if (!dlc) return NextResponse.json({ error: 'DLC not found' }, { status: 404 })

  const filePath = dlc.filePath
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }

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
    gameId: dlc.gameId,
    dlcId,
    dlcType: dlc.type,
    fileName,
    fileSize: BigInt(stat.size),
  })

  const fileStream = fs.createReadStream(filePath)

  const readableStream = new ReadableStream({
    start(controller) {
      fileStream.on('data', (chunk) => controller.enqueue(chunk))
      fileStream.on('end', () => { controller.close(); markDone(token); logDownloadComplete(logId) })
      fileStream.on('error', (err) => { controller.error(err); markDone(token) })
    },
    cancel() { fileStream.destroy(); markDone(token) },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Content-Length': String(stat.size),
      'Cache-Control': 'no-store',
    },
  })
}
