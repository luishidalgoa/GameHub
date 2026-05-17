import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface RecoverResult {
  recovered: number
  failed: number
  details: Array<{ graveyardId: number; newId: number; title: string; success: boolean; error?: string }>
}

export async function POST(req: Request) {
  const body = await req.json()

  if (body.action === 'auto') {
    // ── Recuperación automática: matchea por SHA256 ──────────────────────
    const result: RecoverResult = {
      recovered: 0,
      failed: 0,
      details: [],
    }

    // Obtener todos los juegos en el graveyard con SHA256
    const graveyardGames = await db.game.findMany({
      where: { isHidden: true, sha256: { not: null } },
      select: { id: true, title: true, sha256: true, description: true, releaseYear: true, genre: true, developer: true, publisher: true, rawgId: true, rawgSlug: true, coverUrl: true, coverPath: true, trailerUrl: true, metadataFetchedAt: true },
    })

    // Para cada juego del graveyard, buscar el correspondiente en los nuevos
    for (const old of graveyardGames) {
      try {
        const newGame = await db.game.findFirst({
          where: { isHidden: false, sha256: old.sha256 },
        })

        if (newGame) {
          // Copiar metadatos
          await db.game.update({
            where: { id: newGame.id },
            data: {
              description: old.description,
              releaseYear: old.releaseYear,
              genre: old.genre,
              developer: old.developer,
              publisher: old.publisher,
              rawgId: old.rawgId,
              rawgSlug: old.rawgSlug,
              coverUrl: old.coverUrl,
              coverPath: old.coverPath,
              trailerUrl: old.trailerUrl,
              metadataFetchedAt: old.metadataFetchedAt,
            },
          })

          result.recovered++
          result.details.push({
            graveyardId: old.id,
            newId: newGame.id,
            title: old.title,
            success: true,
          })
        }
      } catch (error) {
        result.failed++
        result.details.push({
          graveyardId: old.id,
          newId: 0,
          title: old.title,
          success: false,
          error: String(error),
        })
      }
    }

    return NextResponse.json(result)
  }

  if (body.action === 'manual') {
    // ── Recuperación manual: copiar metadatos de un juego específico del graveyard ──
    const { graveyardId, newGameId } = body

    if (!graveyardId || !newGameId) {
      return NextResponse.json({ error: 'graveyardId and newGameId required' }, { status: 400 })
    }

    const graveyardGame = await db.game.findUnique({
      where: { id: graveyardId },
      select: { title: true, description: true, releaseYear: true, genre: true, developer: true, publisher: true, rawgId: true, rawgSlug: true, coverUrl: true, coverPath: true, trailerUrl: true, metadataFetchedAt: true },
    })

    if (!graveyardGame) {
      return NextResponse.json({ error: 'Graveyard game not found' }, { status: 404 })
    }

    try {
      const updated = await db.game.update({
        where: { id: newGameId },
        data: {
          description: graveyardGame.description,
          releaseYear: graveyardGame.releaseYear,
          genre: graveyardGame.genre,
          developer: graveyardGame.developer,
          publisher: graveyardGame.publisher,
          rawgId: graveyardGame.rawgId,
          rawgSlug: graveyardGame.rawgSlug,
          coverUrl: graveyardGame.coverUrl,
          coverPath: graveyardGame.coverPath,
          trailerUrl: graveyardGame.trailerUrl,
          metadataFetchedAt: graveyardGame.metadataFetchedAt,
        },
      })

      return NextResponse.json({ success: true, updated })
    } catch (error) {
      return NextResponse.json({ error: String(error) }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
