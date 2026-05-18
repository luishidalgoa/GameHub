import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isLanIp, clientIpFromPlainRequest } from '@/lib/auth'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

// ── Auth (same logic as shop route) ──────────────────────────────────────────

function unauthorized() {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="GameHub Tinfoil Shop"' },
  })
}

async function checkAuth(req: Request): Promise<boolean> {
  const { db: dbClient } = await import('@/lib/db')
  const row      = await dbClient.setting.findUnique({ where: { key: 'tinfoil_password' } })
  const password = row?.value?.trim() ?? ''
  if (!password) return true

  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Basic ')) return false

  const decoded  = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8')
  const provided = decoded.includes(':') ? decoded.split(':').slice(1).join(':') : decoded
  return provided === password
}

// ── Range parsing ─────────────────────────────────────────────────────────────

function parseRange(rangeHeader: string, fileSize: number): [number, number] | null {
  const m = rangeHeader.match(/^bytes=(\d*)-(\d*)$/)
  if (!m) return null
  const start = m[1] ? parseInt(m[1], 10) : fileSize - parseInt(m[2], 10)
  const end   = m[2] ? parseInt(m[2], 10) : fileSize - 1
  if (isNaN(start) || isNaN(end) || start > end || end >= fileSize) return null
  return [start, end]
}

// ── Download route ─────────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: { id: string; filename: string } },
) {
  // LAN-only guard
  const clientIp = clientIpFromPlainRequest(req)
  if (!isLanIp(clientIp)) {
    return NextResponse.json({ error: 'LAN access only' }, { status: 403 })
  }

  if (!(await checkAuth(req))) return unauthorized()

  const gameId = parseInt(params.id, 10)
  if (isNaN(gameId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const game = await db.game.findUnique({ where: { id: gameId } })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!fs.existsSync(game.filePath)) {
    return NextResponse.json({ error: 'File not on disk' }, { status: 404 })
  }

  const fileSize = Number(game.fileSize)
  const fileName = path.basename(game.filePath)
  const rangeHeader = req.headers.get('range')

  const commonHeaders: Record<string, string> = {
    'Content-Type':        'application/octet-stream',
    'Accept-Ranges':       'bytes',
    'Content-Disposition': `attachment; filename="${fileName}"`,
  }

  if (rangeHeader) {
    const range = parseRange(rangeHeader, fileSize)
    if (!range) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      })
    }
    const [start, end] = range
    const chunkSize = end - start + 1

    const nodeStream = fs.createReadStream(game.filePath, { start, end })
    const webStream  = new ReadableStream({
      start(controller) {
        nodeStream.on('data',  (chunk) => controller.enqueue(chunk))
        nodeStream.on('end',   ()      => controller.close())
        nodeStream.on('error', (err)   => controller.error(err))
      },
      cancel() { nodeStream.destroy() },
    })

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        ...commonHeaders,
        'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': String(chunkSize),
      },
    })
  }

  // Full file
  const nodeStream = fs.createReadStream(game.filePath)
  const webStream  = new ReadableStream({
    start(controller) {
      nodeStream.on('data',  (chunk) => controller.enqueue(chunk))
      nodeStream.on('end',   ()      => controller.close())
      nodeStream.on('error', (err)   => controller.error(err))
    },
    cancel() { nodeStream.destroy() },
  })

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      ...commonHeaders,
      'Content-Length': String(fileSize),
    },
  })
}
