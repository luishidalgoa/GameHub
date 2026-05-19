/**
 * GET /api/shop/dlc
 * Sub-index listing only DLC files — navigable as a directory in CyberFoil.
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

  const dlcs = await db.gameDlc.findMany({
    where: { type: 'dlc', game: { isHidden: false } },
    select: { id: true, filePath: true, fileName: true, fileSize: true },
  })

  const host = req.headers.get('host') ?? 'localhost'
  const switchDlcs = dlcs.filter((d) =>
    SWITCH_EXTS.has(d.fileName.slice(d.fileName.lastIndexOf('.')).toLowerCase()) &&
    fs.existsSync(d.filePath),
  )

  const files = switchDlcs.map((d) => ({
    url:  `http://${host}/api/shop/download/dlc/${d.id}/${encodeURIComponent(d.fileName)}`,
    size: Number(d.fileSize),
  }))

  return NextResponse.json({
    files,
    success: `GameHub DLC · ${files.length} items`,
  })
}
