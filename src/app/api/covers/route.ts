import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { downloadAndCacheCover, saveCoverFromBuffer } from '@/lib/covers'
import { resolveCoverPath } from '@/lib/s3'

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('application/json')) {
      const { gameId, url } = await req.json()

      const game = await db.game.findUnique({ where: { id: gameId }, include: { platform: true } })
      if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const key = await downloadAndCacheCover(url, game.platform.slug, gameId)
      await db.game.update({ where: { id: gameId }, data: { coverPath: key } })

      return NextResponse.json({ key, coverPath: resolveCoverPath(key) ?? key })
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
      await db.game.update({ where: { id: gameId }, data: { coverPath: key } })

      return NextResponse.json({ key, coverPath: resolveCoverPath(key) ?? key })
    }

    return NextResponse.json({ error: 'Invalid content type' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[COVERS]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
