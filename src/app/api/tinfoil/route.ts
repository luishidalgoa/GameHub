import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isLanIp, clientIpFromPlainRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// File extensions served to Tinfoil
const SWITCH_EXTS = new Set(['.nsp', '.nsz', '.xci', '.xcz'])

// ── Basic-Auth helpers ────────────────────────────────────────────────────────

function unauthorized() {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="GameHub Tinfoil Shop"' },
  })
}

async function checkAuth(req: Request): Promise<boolean> {
  // Read configured password from DB (key: tinfoil_password). Empty = no auth required.
  const row = await db.setting.findUnique({ where: { key: 'tinfoil_password' } })
  const password = row?.value?.trim() ?? ''
  if (!password) return true // no password set → open on LAN

  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Basic ')) return false

  const decoded  = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8')
  const provided = decoded.includes(':') ? decoded.split(':').slice(1).join(':') : decoded
  return provided === password
}

// ── Shop route ────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  // LAN-only guard
  const clientIp = clientIpFromPlainRequest(req)
  if (!isLanIp(clientIp)) {
    return NextResponse.json({ error: 'LAN access only' }, { status: 403 })
  }

  // Optional password
  if (!(await checkAuth(req))) return unauthorized()

  const games = await db.game.findMany({
    where: { isHidden: false },
    select: { id: true, fileName: true, fileSize: true },
  })

  const switchGames = games.filter((g) =>
    SWITCH_EXTS.has(g.fileName.slice(g.fileName.lastIndexOf('.')).toLowerCase()),
  )

  const host = req.headers.get('host') ?? 'localhost'

  const files = switchGames.map((g) => ({
    // Tinfoil uses the fragment (#name) as the display title in the UI
    url:  `http://${host}/api/tinfoil/download/${g.id}/${encodeURIComponent(g.fileName)}`,
    size: Number(g.fileSize),
  }))

  return NextResponse.json({
    files,
    directories: [],
    success: `GameHub · ${files.length} titles available`,
  })
}
