import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface RecoverResult {
  recovered: number
  failed: number
  details: Array<{ graveyardId: number; newId: number; title: string; success: boolean; matchedBy?: string; error?: string }>
}

const META_FIELDS = {
  description:       true,
  releaseYear:       true,
  genre:             true,
  developer:         true,
  publisher:         true,
  rawgId:            true,
  rawgSlug:          true,
  coverUrl:          true,
  coverPath:         true,
  trailerUrl:        true,
  metadataFetchedAt: true,
} as const

export async function POST(req: Request) {
  const body = await req.json()

  if (body.action === 'auto') {
    const result: RecoverResult = { recovered: 0, failed: 0, details: [] }

    const graveyardGames = await db.game.findMany({
      where: { isHidden: true },
      select: {
        id: true, title: true, sha256: true, fileName: true, platformId: true,
        description: true, releaseYear: true, genre: true, developer: true,
        publisher: true, rawgId: true, rawgSlug: true, coverUrl: true,
        coverPath: true, trailerUrl: true, metadataFetchedAt: true,
      },
    })

    for (const old of graveyardGames) {
      try {
        let newGame = null
        let matchedBy = ''

        // 1. Match by SHA256 (most reliable — same file content)
        if (old.sha256) {
          newGame = await db.game.findFirst({
            where: { isHidden: false, sha256: old.sha256 },
          })
          if (newGame) matchedBy = 'sha256'
        }

        // 2. Fallback: match by fileName + platform (same filename, same platform)
        if (!newGame && old.fileName) {
          newGame = await db.game.findFirst({
            where: { isHidden: false, fileName: old.fileName, platformId: old.platformId },
          })
          if (newGame) matchedBy = 'fileName'
        }

        // 3. Fallback: match by title + platform (last resort)
        if (!newGame) {
          newGame = await db.game.findFirst({
            where: { isHidden: false, title: old.title, platformId: old.platformId },
          })
          if (newGame) matchedBy = 'title'
        }

        if (newGame) {
          await db.$transaction([
            db.game.update({
              where: { id: newGame.id },
              data: {
                description:       old.description,
                releaseYear:       old.releaseYear,
                genre:             old.genre,
                developer:         old.developer,
                publisher:         old.publisher,
                rawgId:            old.rawgId,
                rawgSlug:          old.rawgSlug,
                coverUrl:          old.coverUrl,
                coverPath:         old.coverPath,
                trailerUrl:        old.trailerUrl,
                metadataFetchedAt: old.metadataFetchedAt,
              },
            }),
            // Metadata transferred — remove the graveyard entry
            db.downloadLog.deleteMany({ where: { gameId: old.id } }),
            db.game.delete({ where: { id: old.id } }),
          ])
          result.recovered++
          result.details.push({ graveyardId: old.id, newId: newGame.id, title: old.title, success: true, matchedBy })
        } else {
          // No match found — report it so the UI can show it in the log
          result.details.push({ graveyardId: old.id, newId: 0, title: old.title, success: false })
        }
      } catch (error) {
        result.failed++
        result.details.push({ graveyardId: old.id, newId: 0, title: old.title, success: false, error: String(error) })
      }
    }

    return NextResponse.json(result)
  }

  if (body.action === 'manual') {
    const { graveyardId, newGameId } = body
    if (!graveyardId || !newGameId) {
      return NextResponse.json({ error: 'graveyardId and newGameId required' }, { status: 400 })
    }

    const graveyardGame = await db.game.findUnique({
      where: { id: graveyardId },
      select: {
        title: true, description: true, releaseYear: true, genre: true,
        developer: true, publisher: true, rawgId: true, rawgSlug: true,
        coverUrl: true, coverPath: true, trailerUrl: true, metadataFetchedAt: true,
      },
    })
    if (!graveyardGame) return NextResponse.json({ error: 'Graveyard game not found' }, { status: 404 })

    try {
      const [updated] = await db.$transaction([
        db.game.update({
          where: { id: newGameId },
          data: {
            description:       graveyardGame.description,
            releaseYear:       graveyardGame.releaseYear,
            genre:             graveyardGame.genre,
            developer:         graveyardGame.developer,
            publisher:         graveyardGame.publisher,
            rawgId:            graveyardGame.rawgId,
            rawgSlug:          graveyardGame.rawgSlug,
            coverUrl:          graveyardGame.coverUrl,
            coverPath:         graveyardGame.coverPath,
            trailerUrl:        graveyardGame.trailerUrl,
            metadataFetchedAt: graveyardGame.metadataFetchedAt,
          },
        }),
        // Metadata transferred — remove the graveyard entry
        db.downloadLog.deleteMany({ where: { gameId: graveyardId } }),
        db.game.delete({ where: { id: graveyardId } }),
      ])
      return NextResponse.json({ success: true, updated })
    } catch (error) {
      return NextResponse.json({ error: String(error) }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
