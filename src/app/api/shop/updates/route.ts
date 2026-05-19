/**
 * GET /api/shop/updates
 * Sub-index listing only update patches — navigable as a directory in CyberFoil.
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

  const updates = await db.gameDlc.findMany({
    where: { type: 'update', game: { isHidden: false } },
    select: { id: true, filePath: true, fileName: true, fileSize: true },
  })

  const host = req.headers.get('host') ?? 'localhost'
  const switchUpdates = updates.filter((u) =>
    SWITCH_EXTS.has(u.fileName.slice(u.fileName.lastIndexOf('.')).toLowerCase()) &&
    fs.existsSync(u.filePath),
  )

  const files = switchUpdates.map((u) => ({
    url:  `http://${host}/api/shop/download/dlc/${u.id}/${encodeURIComponent(u.fileName)}`,
    size: Number(u.fileSize),
  }))

  return NextResponse.json({
    files,
    success: `GameHub Updates · ${files.length} items`,
  })
}
