/**
 * GET /api/shop
 *
 * CyberFoil / Tinfoil-compatible HTTP shop index.
 * LAN-only. Optional Basic Auth via the `shop_password` DB setting.
 *
 * Response shape:
 *   files      – downloadable NSP/NSZ/XCI files
 *   directories– sub-indexes (DLC, updates)
 *   titledb    – optional rich metadata keyed by Nintendo Title ID
 *   success    – message shown in the app UI
 */
import { NextResponse } from 'next/server'
import fs from 'fs'
import { db } from '@/lib/db'
import { isLanIp, clientIpFromPlainRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const SWITCH_EXTS = new Set(['.nsp', '.nsz', '.xci', '.xcz'])

// ── Auth ──────────────────────────────────────────────────────────────────────

function unauthorized() {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="GameHub Shop"' },
  })
}

async function checkAuth(req: Request): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { key: 'shop_password' } })
  const password = row?.value?.trim() ?? ''
  if (!password) return true // open on LAN when no password set

  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Basic ')) return false
  const decoded  = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8')
  const provided = decoded.includes(':') ? decoded.split(':').slice(1).join(':') : decoded
  return provided === password
}

// ── Title ID extraction ───────────────────────────────────────────────────────

/** Extract Nintendo Title ID from a filename like "Game Name [0100ABC00XXXX000].nsp" */
function extractTitleId(fileName: string): string | null {
  const m = fileName.match(/\[([0-9a-fA-F]{16})\]/)
  return m ? m[1].toUpperCase() : null
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const clientIp = clientIpFromPlainRequest(req)
  if (!isLanIp(clientIp)) {
    return NextResponse.json({ error: 'LAN access only' }, { status: 403 })
  }
  if (!(await checkAuth(req))) return unauthorized()

  const games = await db.game.findMany({
    where: { isHidden: false },
    select: {
      id:          true,
      filePath:    true,
      fileName:    true,
      fileSize:    true,
      title:       true,
      description: true,
      releaseYear: true,
      genre:       true,
      publisher:   true,
      platform:    { select: { slug: true } },
      dlcs:        { select: { id: true, fileName: true, fileSize: true, type: true } },
    },
  })

  // Games that have an actual downloadable file with a Switch extension AND the
  // file is currently accessible on disk. This prevents listing titles whose
  // storage (e.g. a network share) is temporarily unreachable.
  const switchGames = games.filter((g) =>
    g.fileSize > 0 &&
    SWITCH_EXTS.has(g.fileName.slice(g.fileName.lastIndexOf('.')).toLowerCase()) &&
    fs.existsSync(g.filePath),
  )

  const host = req.headers.get('host') ?? 'localhost'
  const base = `http://${host}`

  // ── files ─────────────────────────────────────────────────────────────────
  const files = switchGames.map((g) => ({
    url:  `${base}/api/shop/download/${g.id}/${encodeURIComponent(g.fileName)}`,
    size: Number(g.fileSize),
  }))

  // ── titledb (rich metadata for CyberFoil eShop display) ───────────────────
  const titledb: Record<string, object> = {}
  for (const g of switchGames) {
    const titleId = extractTitleId(g.fileName)
    if (!titleId) continue
    titledb[titleId] = {
      id:          titleId,
      name:        g.title,
      description: g.description ?? '',
      releaseDate: g.releaseYear ? parseInt(`${g.releaseYear}0101`) : undefined,
      category:    g.genre ? [g.genre] : undefined,
      publisher:   g.publisher ?? undefined,
      size:        Number(g.fileSize),
    }
  }

  // ── directories: separate DLC and update sub-indexes ─────────────────────
  // Check ALL games (including stubs without a base file) so DLC/updates from
  // games that only have extras still surface in the sub-index links.
  const hasDlc     = games.some((g) => g.dlcs.some((d) => d.type === 'dlc'))
  const hasUpdates = games.some((g) => g.dlcs.some((d) => d.type === 'update'))

  const directories: string[] = []
  if (hasDlc)     directories.push(`${base}/api/shop/dlc`)
  if (hasUpdates) directories.push(`${base}/api/shop/updates`)

  return NextResponse.json({
    files,
    directories,
    ...(Object.keys(titledb).length > 0 && { titledb }),
    success: `GameHub · ${files.length} titles`,
  })
}
