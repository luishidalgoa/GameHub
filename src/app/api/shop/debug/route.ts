/**
 * GET /api/shop/debug
 * Diagnostic endpoint behind the same gates as the rest of the shop. Shows:
 *   - Every game in the DB with its shop inclusion status
 *   - Every GameDlc (updates/DLC/mods) with its status
 *
 * Example: http://192.168.1.x:3001/api/shop/debug
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardShopRequest } from '@/lib/shop-auth'
import { isSwitchFile, statSize } from '@/lib/shop-files'
import { extractSwitchTitleId } from '@/lib/scanner/titleid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Types published in the main index alongside base games. */
const INDEXED_AS_BASE = new Set<string>()
/** Types published through a sub-index directory. */
const INDEXED_AS_EXTRA = new Set(['dlc', 'update'])

export async function GET(req: Request) {
  const denied = await guardShopRequest(req)
  if (denied) return denied

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

  const gameSizes = await statSize(games.map((g) => g.filePath))

  const gameResults = games.map((g, i) => {
    const ext         = g.fileName.slice(g.fileName.lastIndexOf('.')).toLowerCase()
    const isSwitchExt = isSwitchFile(g.fileName)
    const onDiskSize  = gameSizes[i]

    const reasons: string[] = []
    if (g.isHidden)    reasons.push('isHidden=true (marked stale by scanner)')
    if (!isSwitchExt)  reasons.push(`extension "${ext}" not in Switch list (.nsp/.nsz/.xci/.xcz)`)
    if (isSwitchExt && onDiskSize === null)
                       reasons.push(`file not readable on disk: ${g.filePath}`)
    if (onDiskSize === 0) reasons.push('file is empty on disk (0 bytes)')
    // Size is served from disk now, so a stale DB value is informational only.
    if (onDiskSize !== null && onDiskSize !== Number(g.fileSize))
                       reasons.push(
                         `note: DB fileSize ${g.fileSize} != on-disk ${onDiskSize} — rescan to refresh (the shop serves the on-disk size)`,
                       )

    const blocking = reasons.filter((r) => !r.startsWith('note:'))

    return {
      id:         g.id,
      title:      g.title,
      fileName:   g.fileName,
      filePath:   g.filePath,
      fileSize:   g.fileSize.toString(),
      onDiskSize: onDiskSize === null ? null : String(onDiskSize),
      titleId:    extractSwitchTitleId(g.fileName),
      platform:   g.platform?.name ?? '—',
      status:     blocking.length === 0 ? 'included' : 'excluded',
      reasons,
    }
  })

  // ── DLC / Updates / Regional editions / Mods ─────────────────────────────
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

  const dlcSizes = await statSize(dlcs.map((d) => d.filePath))

  const dlcResults = dlcs.map((d, i) => {
    const ext         = d.fileName.slice(d.fileName.lastIndexOf('.')).toLowerCase()
    const isSwitchExt = isSwitchFile(d.fileName)
    const onDiskSize  = dlcSizes[i]
    const publishable = INDEXED_AS_BASE.has(d.type) || INDEXED_AS_EXTRA.has(d.type)

    const reasons: string[] = []
    if (d.game.isHidden) reasons.push('parent game isHidden=true')
    if (!publishable)    reasons.push(`type "${d.type}" is not published to the shop`)
    if (!isSwitchExt)    reasons.push(`extension "${ext}" not in Switch list`)
    if (isSwitchExt && onDiskSize === null)
                         reasons.push(`file not readable on disk: ${d.filePath}`)
    if (onDiskSize === 0) reasons.push('file is empty on disk (0 bytes)')

    return {
      id:         d.id,
      type:       d.type,
      publishedAs: INDEXED_AS_BASE.has(d.type) ? 'main index' : INDEXED_AS_EXTRA.has(d.type) ? `/api/shop/${d.type === 'dlc' ? 'dlc' : 'updates'}` : null,
      fileName:   d.fileName,
      filePath:   d.filePath,
      fileSize:   d.fileSize.toString(),
      onDiskSize: onDiskSize === null ? null : String(onDiskSize),
      gameTitle:  d.game.title,
      status:     reasons.length === 0 ? 'included' : 'excluded',
      reasons,
    }
  })

  const countIncluded = (type: string) =>
    dlcResults.filter((r) => r.status === 'included' && r.type === type).length
  const countTotal = (type: string) => dlcResults.filter((r) => r.type === type).length

  return NextResponse.json({
    summary: {
      games:   { total: gameResults.length, included: gameResults.filter((r) => r.status === 'included').length },
      regions: { total: countTotal('region'), included: countIncluded('region') },
      updates: { total: countTotal('update'), included: countIncluded('update') },
      dlcs:    { total: countTotal('dlc'),    included: countIncluded('dlc') },
      mods:    { total: countTotal('mod'),    included: 0 },
    },
    games:  gameResults,
    extras: dlcResults,
  })
}
