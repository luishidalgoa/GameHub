/**
 * GET /api/download/game-extras/[gameId]?type=dlc|update|mod&token=bulk_xxx
 *
 * Streams a ZIP of all DLC / update / mod files for a single game.
 * Uses store mode (level 0) — ROM files are already compressed.
 */
import { NextResponse }                      from 'next/server'
import { db }                                from '@/lib/db'
import { consumeBulkToken, isBulkToken }     from '@/lib/bulk-queue'
import type { BulkType }                     from '@/lib/bulk-queue'
import archiver                              from 'archiver'
import fs                                    from 'fs'
import { PassThrough }                       from 'stream'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  req:    Request,
  { params }: { params: { gameId: string } },
) {
  const { searchParams } = new URL(req.url)
  const token  = searchParams.get('token') ?? ''
  const type   = searchParams.get('type') as BulkType | null

  if (!isBulkToken(token)) {
    return NextResponse.json({ error: 'Valid token required' }, { status: 401 })
  }
  const bulk = consumeBulkToken(token)
  if (!bulk) {
    return NextResponse.json({ error: 'Token not found or expired' }, { status: 401 })
  }

  const gameId = parseInt(params.gameId, 10)
  if (bulk.gameId !== gameId || bulk.type !== type) {
    return NextResponse.json({ error: 'Token mismatch' }, { status: 403 })
  }
  if (!type || !['dlc', 'update', 'mod'].includes(type)) {
    return NextResponse.json({ error: 'type must be dlc | update | mod' }, { status: 400 })
  }

  const game = await db.game.findUnique({ where: { id: gameId }, select: { title: true } })
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const extras = await db.gameDlc.findMany({
    where:   { gameId, type },
    select:  { filePath: true, fileName: true },
    orderBy: { fileName: 'asc' },
  })

  const existing = extras.filter(e => fs.existsSync(e.filePath))
  if (existing.length === 0) {
    return NextResponse.json({ error: 'No files found on disk' }, { status: 404 })
  }

  const safeTitle = game.title.replace(/[^a-zA-Z0-9\-_ ]/g, '').trim().slice(0, 40)
  const zipName   = `${safeTitle} - ${type}s.zip`

  const passthrough = new PassThrough()
  const archive     = archiver('zip', { zlib: { level: 0 } })

  archive.on('error', (err) => {
    console.error('[game-zip] archiver error:', err)
    passthrough.destroy(err)
  })

  archive.pipe(passthrough)
  for (const extra of existing) {
    archive.file(extra.filePath, { name: extra.fileName })
  }
  archive.finalize()

  const readable = new ReadableStream({
    start(controller) {
      passthrough.on('data',  (chunk: Buffer) => controller.enqueue(chunk))
      passthrough.on('end',   ()              => controller.close())
      passthrough.on('error', (err)           => controller.error(err))
    },
    cancel() { archive.abort() },
  })

  return new Response(readable, {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(zipName)}"`,
      'Cache-Control':       'no-store',
      'X-File-Count':        String(existing.length),
    },
  })
}
