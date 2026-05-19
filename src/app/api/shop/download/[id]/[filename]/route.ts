/**
 * GET /api/shop/download/[id]/[filename]
 * Streams a base game file with full Range request support (pause/resume).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isLanIp, clientIpFromPlainRequest } from '@/lib/auth'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

function unauthorized() {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="GameHub Shop"' },
  })
}

async function checkAuth(req: Request): Promise<boolean> {
  const row      = await db.setting.findUnique({ where: { key: 'shop_password' } })
  const password = row?.value?.trim() ?? ''
  if (!password) return true
  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Basic ')) return false
  const decoded  = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8')
  const provided = decoded.includes(':') ? decoded.split(':').slice(1).join(':') : decoded
  return provided === password
}

function parseRange(header: string, size: number): [number, number] | null {
  const m = header.match(/^bytes=(\d*)-(\d*)$/)
  if (!m) return null
  const start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10)
  const end   = m[2] ? parseInt(m[2], 10) : size - 1
  if (isNaN(start) || isNaN(end) || start > end || end >= size) return null
  return [start, end]
}

function streamFile(filePath: string, start?: number, end?: number): ReadableStream {
  const nodeStream = fs.createReadStream(filePath, start !== undefined ? { start, end } : undefined)
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data',  (chunk) => controller.enqueue(chunk))
      nodeStream.on('end',   ()      => controller.close())
      nodeStream.on('error', (err)   => controller.error(err))
    },
    cancel() { nodeStream.destroy() },
  })
}

export async function GET(
  req: Request,
  { params }: { params: { id: string; filename: string } },
) {
  const clientIp = clientIpFromPlainRequest(req)
  if (!isLanIp(clientIp)) {
    return NextResponse.json({ error: 'LAN access only' }, { status: 403 })
  }
  if (!(await checkAuth(req))) return unauthorized()

  const gameId = parseInt(params.id, 10)
  if (isNaN(gameId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const game = await db.game.findUnique({ where: { id: gameId } })
  if (!game || !fs.existsSync(game.filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const fileSize = Number(game.fileSize)
  const fileName = path.basename(game.filePath)
  const rangeHeader = req.headers.get('range')

  const baseHeaders: Record<string, string> = {
    'Content-Type':        'application/octet-stream',
    'Accept-Ranges':       'bytes',
    'Content-Disposition': `attachment; filename="${fileName}"`,
  }

  if (rangeHeader) {
    const range = parseRange(rangeHeader, fileSize)
    if (!range) {
      return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } })
    }
    const [start, end] = range
    return new NextResponse(streamFile(game.filePath, start, end), {
      status: 206,
      headers: { ...baseHeaders, 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Content-Length': String(end - start + 1) },
    })
  }

  return new NextResponse(streamFile(game.filePath), {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(fileSize) },
  })
}
