/**
 * POST /api/games/merge   { targetId, sourceId }
 *
 * Absorbs `sourceId` into `targetId` (target is the surviving card):
 *   - moves source's DLC/update/mod rows to the target
 *   - if the target has no base file and the source is a base, promotes the
 *     source's file to be the target's base
 *   - otherwise keeps the source's file as an extra (update/dlc)
 *   - adopts the source's groupKey so a future scan keeps them merged
 *   - deletes the source row
 *
 * Admin-only (enforced by middleware).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cleanTitle } from '@/lib/utils'
import { extractSwitchTitleId, classifySwitchTitleId } from '@/lib/scanner/titleid'
import { serializeBigInt } from '@/lib/serialize'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { targetId, sourceId } = await req.json()
  const tId = Number(targetId)
  const sId = Number(sourceId)

  if (!tId || !sId || tId === sId) {
    return NextResponse.json({ error: 'targetId and a different sourceId are required' }, { status: 400 })
  }

  const [target, source] = await Promise.all([
    db.game.findUnique({ where: { id: tId }, include: { platform: true } }),
    db.game.findUnique({ where: { id: sId } }),
  ])

  if (!target || !source) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (target.platformId !== source.platformId) {
    return NextResponse.json({ error: 'Games are on different platforms' }, { status: 400 })
  }

  const switchMode = target.platform.scanMode === 'folder'

  // 1. Move source's DLC rows to the target
  await db.gameDlc.updateMany({ where: { gameId: sId }, data: { gameId: tId } })

  // 2. Snapshot source fields, then delete the source row so its unique
  //    filePath frees up (lets us promote it to the target's base if needed).
  const src = { filePath: source.filePath, fileName: source.fileName, fileSize: source.fileSize, title: source.title, groupKey: source.groupKey }
  await db.game.delete({ where: { id: sId } })

  // 3. Decide what to do with the source's own file
  const data: { groupKey?: string; filePath?: string; fileName?: string; fileSize?: bigint } = {}
  if (!target.groupKey && src.groupKey) data.groupKey = src.groupKey

  if (src.fileSize > BigInt(0) && src.filePath !== target.filePath) {
    const tid  = switchMode ? extractSwitchTitleId(src.fileName) : null
    const kind = tid ? classifySwitchTitleId(tid) : (target.fileSize === BigInt(0) ? 'base' : 'update')

    if (kind === 'base' && target.fileSize === BigInt(0)) {
      // Target had no base file → promote the source's base file
      data.filePath = src.filePath
      data.fileName = src.fileName
      data.fileSize = src.fileSize
    } else {
      // Keep the source file as a downloadable extra
      const exists = await db.gameDlc.findUnique({ where: { filePath: src.filePath } })
      if (!exists) {
        await db.gameDlc.create({
          data: {
            gameId:   tId,
            filePath: src.filePath,
            fileName: src.fileName,
            fileSize: src.fileSize,
            title:    src.title ?? cleanTitle(src.fileName),
            type:     kind === 'base' ? 'update' : kind,
          },
        }).catch(() => {})
      }
    }
  }

  if (Object.keys(data).length) {
    await db.game.update({ where: { id: tId }, data })
  }

  const merged = await db.game.findUnique({ where: { id: tId }, include: { platform: true, dlcs: true } })
  return NextResponse.json(serializeBigInt(merged))
}
