/**
 * GET /api/shop/debug
 * LAN-only diagnostic endpoint. Shows:
 *   - Every game in the DB with its shop inclusion status
 *   - Every GameDlc (updates/DLC/mods) with its shop inclusion status
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

  // ── Base games ───────────────────────────────────────────────────────────
  const games = await db.game.findMany({
    orderBy: { title: 'asc' },
    select: {
      id:       true,
      title:    true,
      fileName: true,
      filePath: true,
      fileSize: true,
      isHidden: true,
      platform: { select: { name: true } },
    },
  })

  const gameResults = games.map((g) => {
    const ext         = g.fileName.slice(g.fileName.lastIndexOf('.')).toLowerCase()
    const isSwitchExt = SWITCH_EXTS.has(ext)
    const hasFileSize = g.fileSize > BigInt(0)
    const fileExists  = !g.isHidden && hasFileSize && isSwitchExt
      ? fs.existsSync(g.filePath)
      : false

    const reasons: string[] = []
    if (g.isHidden)   reasons.push('isHidden=true (marked stale by scanner)')
    if (!hasFileSize) reasons.push('fileSize=0 (stub — no base game file)')
    if (!isSwitchExt) reasons.push(`extension "${ext}" not in Switch list (.nsp/.nsz/.xci/.xcz)`)
    if (hasFileSize && !g.isHidden && isSwitchExt && !fileExists)
                      reasons.push(`file not found on disk: ${g.filePath}`)

    return {
      id:       g.id,
      title:    g.title,
      fileName: g.fileName,
      filePath: g.filePath,
      fileSize: g.fileSize.toString(),
      platform: g.platform?.name ?? '—',
      status:   reasons.length === 0 ? 'included' : 'excluded',
      reasons,
    }
  })

  // ── DLC / Updates / Mods ─────────────────────────────────────────────────
  const dlcs = await db.gameDlc.findMany({
    orderBy: [{ type: 'asc' }, { fileName: 'asc' }],
    select: {
      id:       true,
      fileName: true,
      filePath: true,
      fileSize: true,
      type:     true,
      game:     { select: { title: true, isHidden: true } },
    },
  })

  const dlcResults = dlcs.map((d) => {
    const ext         = d.fileName.slice(d.fileName.lastIndexOf('.')).toLowerCase()
    const isSwitchExt = SWITCH_EXTS.has(ext)
    const fileExists  = isSwitchExt ? fs.existsSync(d.filePath) : false

    const reasons: string[] = []
    if (d.game.isHidden) reasons.push('parent game isHidden=true')
    if (!isSwitchExt)    reasons.push(`extension "${ext}" not in Switch list`)
    if (isSwitchExt && !fileExists)
                         reasons.push(`file not found on disk: ${d.filePath}`)

    return {
      id:        d.id,
      type:      d.type,
      fileName:  d.fileName,
      filePath:  d.filePath,
      fileSize:  d.fileSize.toString(),
      gameTitle: d.game.title,
      status:    reasons.length === 0 ? 'included' : 'excluded',
      reasons,
    }
  })

  const gIncluded = gameResults.filter((r) => r.status === 'included').length
  const uIncluded = dlcResults.filter((r) => r.status === 'included' && r.type === 'update').length
  const dIncluded = dlcResults.filter((r) => r.status === 'included' && r.type === 'dlc').length

  return NextResponse.json({
    summary: {
      games:   { total: gameResults.length, included: gIncluded },
      updates: { total: dlcResults.filter(r => r.type === 'update').length, included: uIncluded },
      dlcs:    { total: dlcResults.filter(r => r.type === 'dlc').length,    included: dIncluded },
      mods:    { total: dlcResults.filter(r => r.type === 'mod').length },
    },
    games:   gameResults,
    extras:  dlcResults,
  })
}
