import { db } from '@/lib/db'
import { libraryGameWhere, UNFINDABLE, NOT_UNFINDABLE, pendingWhere, WITHOUT_METADATA } from '@/lib/library'

export type BatchMode = 'missing' | 'fill' | 'redo' | 'wrong-provider' | 'popularity' | 'autocomplete-scores'

/** The fields a fill pass can complete on a game. */
const FILLABLE = ['description', 'developer', 'publisher', 'genre', 'releaseYear'] as const

export interface BatchPreview {
  mode: BatchMode
  /** Games the pass would touch. Null when only the run itself can tell (wrong-provider). */
  games: number | null
  /** Empty fields across those games, for the fill pass. */
  fields?: number
  /** Games the pass leaves alone on purpose: no source could identify them. */
  skippedUnfindable: number
}

/**
 * What a batch pass would touch, counted before anything runs. Mirrors the batch's
 * own filters: unfindable games are left out of every pass but the explicit
 * requeue, and fields the owner locked are not counted as fillable.
 */
export async function previewBatch(mode: BatchMode, platformSlug?: string): Promise<BatchPreview> {
  const base = { AND: [libraryGameWhere(platformSlug), NOT_UNFINDABLE] }
  const skippedUnfindable = await db.game.count({ where: { ...libraryGameWhere(platformSlug), ...UNFINDABLE } })

  if (mode === 'redo') {
    return { mode, games: await db.game.count({ where: base }), skippedUnfindable }
  }
  if (mode === 'missing') {
    return { mode, games: await db.game.count({ where: { ...base, ...WITHOUT_METADATA } }), skippedUnfindable }
  }
  if (mode === 'popularity') {
    return { mode, games: await db.game.count({ where: { ...base, popularityFetchedAt: null } }), skippedUnfindable }
  }
  if (mode === 'autocomplete-scores') {
    return { mode, games: await db.game.count({ where: { ...base, rawgScore: null } }), skippedUnfindable }
  }
  if (mode === 'fill') {
    const anyEmpty = { OR: FILLABLE.map(f => ({ [f]: null })) } as const
    const games = await db.game.count({ where: { ...pendingWhere(anyEmpty as never), ...libraryGameWhere(platformSlug) } })
    let fields = 0
    for (const f of FILLABLE) {
      fields += await db.game.count({ where: { ...pendingWhere({ [f]: null } as never), ...libraryGameWhere(platformSlug) } })
    }
    return { mode, games, fields, skippedUnfindable }
  }
  // wrong-provider needs each game's source to know whether it is wrong.
  return { mode, games: null, skippedUnfindable }
}
