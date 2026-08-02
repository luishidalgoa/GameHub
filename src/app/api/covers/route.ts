import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { downloadAndCacheCover, saveCoverFromBuffer } from '@/lib/covers'
import { resolveCoverPath } from '@/lib/s3'
import { isCoverSource, parseMetadataSources, type MetadataSources } from '@/lib/metadata/sources'

/**
 * Record where this cover came from.
 *
 * The image is only half the change: `metadataSources.cover` drives the badge in
 * the editor, and leaving it on whatever the batch last wrote makes it lie about
 * a cover the admin picked by hand. `coverManual` additionally protects the
 * choice from the automated 'wrong-provider' sweep.
 *
 * A crop adjustment sends no source — it re-uploads the SAME artwork, so the
 * original provenance survives — but it still counts as manual: the admin framed
 * that image on purpose and a sweep must not throw the crop away.
 */
function coverProvenance(
  current: string | null,
  source: unknown,
  adjusted = false,
): { metadataSources?: string; sources: MetadataSources } {
  const prev = parseMetadataSources(current)
  const isNewSource = isCoverSource(source)
  if (!isNewSource && !adjusted) return { sources: prev }
  const next: MetadataSources = {
    ...prev,
    ...(isNewSource && { cover: source }),
    coverManual: true,
  }
  return { metadataSources: JSON.stringify(next), sources: next }
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('application/json')) {
      const { gameId, url, source } = await req.json()

      const game = await db.game.findUnique({ where: { id: gameId }, include: { platform: true } })
      if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const key = await downloadAndCacheCover(url, game.platform.slug, gameId)
      const { metadataSources, sources } = coverProvenance(game.metadataSources, source)
      await db.game.update({
        where: { id: gameId },
        data: { coverPath: key, ...(metadataSources && { metadataSources }) },
      })

      return NextResponse.json({ key, coverPath: resolveCoverPath(key) ?? key, sources })
    }

    if (contentType.includes('multipart/form-data')) {
      const form     = await req.formData()
      const gameId   = parseInt(form.get('gameId') as string, 10)
      const file     = form.get('file') as File
      // When the upload is a crop adjustment we preserve the stored original
      // so the full-res source remains available for future re-crops.
      const adjusted = form.get('adjusted') === 'true'

      const game = await db.game.findUnique({ where: { id: gameId }, include: { platform: true } })
      if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const buffer = Buffer.from(await file.arrayBuffer())
      const key    = await saveCoverFromBuffer(buffer, game.platform.slug, gameId, !adjusted)
      const { metadataSources, sources } = coverProvenance(game.metadataSources, form.get('source'), adjusted)
      await db.game.update({
        where: { id: gameId },
        data: { coverPath: key, ...(metadataSources && { metadataSources }) },
      })

      return NextResponse.json({ key, coverPath: resolveCoverPath(key) ?? key, sources })
    }

    return NextResponse.json({ error: 'Invalid content type' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[COVERS]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
