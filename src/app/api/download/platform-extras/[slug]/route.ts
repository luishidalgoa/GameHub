/**
 * GET /api/download/platform-extras/[slug]?type=dlc|update|mod
 *
 * Streams a ZIP file containing all DLC / update / mod files for the given
 * platform.  Admin session required (bulk download of an entire platform's
 * extras is a privileged operation).
 *
 * ZIP uses store mode (level 0) — ROM files are already compressed and the
 * Raspberry Pi CPU budget is limited.
 */
import { NextResponse }   from 'next/server'
import { db }             from '@/lib/db'
import { isAdminSession } from '@/lib/auth'
import archiver           from 'archiver'
import fs                 from 'fs'
import { PassThrough }    from 'stream'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type DlcType = 'dlc' | 'update' | 'mod'

export async function GET(
  req: Request,
  { params }: { params: { slug: string } },
) {
  if (!await isAdminSession()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') as DlcType | null
  if (!type || !['dlc', 'update', 'mod'].includes(type)) {
    return NextResponse.json({ error: 'type must be dlc | update | mod' }, { status: 400 })
  }

  const platform = await db.platform.findUnique({ where: { slug: params.slug } })
  if (!platform) return NextResponse.json({ error: 'Platform not found' }, { status: 404 })

  // Fetch all DLC/update/mod files for this platform
  const extras = await db.gameDlc.findMany({
    where: {
      type,
      game: { platformId: platform.id, isHidden: false },
    },
    select: { filePath: true, fileName: true },
    orderBy: { fileName: 'asc' },
  })

  // Filter to files that actually exist on disk
  const existing = extras.filter(e => fs.existsSync(e.filePath))

  if (existing.length === 0) {
    return NextResponse.json({ error: 'No files found' }, { status: 404 })
  }

  const typeLabel: Record<DlcType, string> = { dlc: 'DLCs', update: 'Updates', mod: 'Mods' }
  const zipName = `${platform.slug}-${type}s.zip`

  // ── Stream the ZIP ──────────────────────────────────────────────────────────
  const passthrough = new PassThrough()
  const archive = archiver('zip', { zlib: { level: 0 } }) // store mode — no CPU overhead

  archive.on('error', (err) => {
    console.error('[bulk-zip] archiver error:', err)
    passthrough.destroy(err)
  })

  archive.pipe(passthrough)

  for (const extra of existing) {
    archive.file(extra.filePath, { name: extra.fileName })
  }

  archive.finalize()

  // Convert Node.js PassThrough to Web ReadableStream
  const readable = new ReadableStream({
    start(controller) {
      passthrough.on('data',  (chunk: Buffer) => controller.enqueue(chunk))
      passthrough.on('end',   ()              => controller.close())
      passthrough.on('error', (err)           => controller.error(err))
    },
    cancel() { archive.abort() },
  })

  console.log(`[bulk-zip] Streaming ${existing.length} ${typeLabel[type]} for ${platform.name} → ${zipName}`)

  return new Response(readable, {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Cache-Control':       'no-store',
      'X-File-Count':        String(existing.length),
    },
  })
}
