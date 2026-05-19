/**
 * GET /api/shop/debug
 * LAN-only diagnostic endpoint. Shows every game in the DB that could
 * potentially appear in the CyberFoil shop, with the reason it is included
 * or excluded. Useful to diagnose why some titles don't appear in the shop.
 *
 * Example: http://192.168.1.x:3000/api/shop/debug
 */
import { NextResponse } from 'next/server'
import fs from 'fs'
import { db } from '@/lib/db'
import { isLanIp, clientIpFromPlainRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const SWITCH_EXTS = new Set(['.nsp', '.nsz', '.xci', '.xcz'])

export async function GET(req: Request) {
  const clientIp = clientIpFromPlainRequest(req)
  if (!isLanIp(clientIp)) {
    return NextResponse.json({ error: 'LAN access only' }, { status: 403 })
  }

  const games = await db.game.findMany({
    orderBy: { title: 'asc' },
    select: {
      id:       true,
      title:    true,
      fileName: true,
      filePath: true,
      fileSize: true,
      isHidden: true,
      platform: { select: { name: true, slug: true } },
    },
  })

  const results = games.map((g) => {
    const ext        = g.fileName.slice(g.fileName.lastIndexOf('.')).toLowerCase()
    const isSwitchExt = SWITCH_EXTS.has(ext)
    const hasFileSize = g.fileSize > 0
    const fileExists  = !g.isHidden && hasFileSize ? fs.existsSync(g.filePath) : false

    let status: 'included' | 'excluded'
    const reasons: string[] = []

    if (g.isHidden)       reasons.push('isHidden=true (marked stale by scanner)')
    if (!hasFileSize)     reasons.push('fileSize=0 (stub entry — no base game file)')
    if (!isSwitchExt)     reasons.push(`extension "${ext}" not in Switch list (.nsp/.nsz/.xci/.xcz)`)
    if (hasFileSize && !g.isHidden && isSwitchExt && !fileExists)
                          reasons.push(`file not found on disk: ${g.filePath}`)

    status = reasons.length === 0 ? 'included' : 'excluded'

    return {
      id:       g.id,
      title:    g.title,
      fileName: g.fileName,
      filePath: g.filePath,
      fileSize: g.fileSize.toString(),
      platform: g.platform?.name ?? '—',
      status,
      reasons,
    }
  })

  const included = results.filter((r) => r.status === 'included').length
  const excluded = results.filter((r) => r.status === 'excluded').length

  return NextResponse.json({
    summary: { total: results.length, included, excluded },
    games: results,
  }, { status: 200 })
}
