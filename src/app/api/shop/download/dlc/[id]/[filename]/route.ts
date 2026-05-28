/**
 * GET /api/shop/download/dlc/[id]/[filename]
 * Streams a DLC or update file with Range request support.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isLanIp, clientIpFromPlainRequest } from '@/lib/auth'
import { createFileWebStream } from '@/lib/stream'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

export async function GET(
  req: Request,
  { params }: { params: { id: string; filename: string } },
) {
  const clientIp = clientIpFromPlainRequest(req)
  if (!isLanIp(clientIp)) {
    return NextResponse.json({ error: 'LAN access only' }, { status: 403 })
  }
  if (!(await checkAuth(req))) return unauthorized()

  const dlcId = parseInt(params.id, 10)
  if (isNaN(dlcId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const dlc = await db.gameDlc.findUnique({ where: { id: dlcId } })
  if (!dlc || !fs.existsSync(dlc.filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const fileSize = Number(dlc.fileSize)
  const fileName = path.basename(dlc.filePath)
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
    return new NextResponse(createFileWebStream(dlc.filePath, { start, end }), {
      status: 206,
      headers: { ...baseHeaders, 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Content-Length': String(end - start + 1) },
    })
  }

  return new NextResponse(createFileWebStream(dlc.filePath), {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(fileSize) },
  })
}
