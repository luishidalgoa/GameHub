import type { Prisma } from '@prisma/client'
import { libraryGameWhere, NOT_UNFINDABLE, pendingMetadataWhere } from '@/lib/library'
import type { BatchMode, FieldScope } from './scope'

// Which games a batch pass selects. The batch engine and its preview both build the
// selection here, so the number the admin sees is the number the pass will touch.

/** Empty-field columns a 'fill' pass looks at, per category. */
const GAP_COLUMNS: Record<'ficha' | 'imagenes', readonly string[]> = {
  ficha:    ['description', 'developer', 'publisher', 'genre', 'releaseYear', 'releaseDate'],
  imagenes: ['coverPath', 'screenshotPaths'],
}

/**
 * The columns a 'fill' pass counts as gaps for this scope. Trailers and scores count
 * only when they are wanted at all.
 */
export function gapColumnsFor(scope: readonly FieldScope[], withTrailers: boolean, withScores: boolean): string[] {
  return [
    ...(scope.includes('ficha') ? GAP_COLUMNS.ficha : []),
    ...(scope.includes('imagenes') ? GAP_COLUMNS.imagenes : []),
    ...(scope.includes('notas') && withScores ? ['rawgScore'] : []),
    ...(scope.includes('multimedia') && withTrailers ? ['trailerUrl'] : []),
  ]
}

export interface SelectionOptions {
  mode:             BatchMode
  scope:            readonly FieldScope[]
  platformSlug?:    string
  /** Only games with an id above this (the resume cursor of an interrupted job). */
  resumeAfterId?:   number
  /** Trailers wanted at all (the multimedia category is also needed). */
  withTrailers:     boolean
  /** Scores wanted at all (the notas category is also needed). */
  withScores:       boolean
  /** 'missing' also takes games that already have metadata but no trailer. */
  backfillTrailers: boolean
  popularityRedo:   boolean
  now:              Date
}

/**
 * The Prisma filter of one pass, or null when nothing can match (an empty scope,
 * or a 'fill' with no gaps to look at). Unfindable games and disabled platforms are
 * out of every pass, as in the admin's counts.
 */
export function selectionWhere(o: SelectionOptions): Prisma.GameWhereInput | null {
  const scope = o.scope
  if (scope.length === 0) return null

  const trailers = scope.includes('multimedia') && o.withTrailers
  const scores = scope.includes('notas') && o.withScores

  // A game whose provider failed waits for its retry time (#110), in every mode.
  const base: Prisma.GameWhereInput[] = [
    libraryGameWhere(o.platformSlug),
    NOT_UNFINDABLE,
    { OR: [{ metadataNextRetryAt: null }, { metadataNextRetryAt: { lte: o.now } }] },
  ]
  if (o.resumeAfterId) base.push({ id: { gt: o.resumeAfterId } })
  const within = (clause: Prisma.GameWhereInput): Prisma.GameWhereInput => ({ AND: [...base, clause] })

  switch (o.mode) {
    case 'popularity':
      return within({
        rawgId: { not: null },                                   // only games we can look up
        ...(o.popularityRedo ? {} : { popularityFetchedAt: null }), // idempotent: skip already-fetched
      })
    case 'autocomplete-scores':
      return within({ rawgScore: null })                          // only games WITHOUT a score
    case 'redo':
    case 'wrong-provider':
      // wrong-provider is judged per game in the engine: provenance is a JSON field.
      return within({})
    case 'fill': {
      const gaps = gapColumnsFor(scope, trailers, scores)
      if (gaps.length === 0) return null
      return within({ OR: gaps.map(column => ({ [column]: null })) })
    }
    case 'missing': {
      const trailerBackfill: Prisma.GameWhereInput[] = trailers && o.backfillTrailers ? [{ trailerUrl: null }] : []
      if (scope.includes('ficha')) return within({ OR: [pendingMetadataWhere(o.now), ...trailerBackfill] })
      // Without the ficha the pass cannot mark a game as done, so it targets the games
      // still lacking something in scope. Once the pass writes it, the game drops out.
      const gaps = gapColumnsFor(scope, trailers, scores)
      const pendingGaps: Prisma.GameWhereInput[] = gaps.length
        ? [{ AND: [pendingMetadataWhere(o.now), { OR: gaps.map(column => ({ [column]: null })) }] }]
        : []
      const ors = [...pendingGaps, ...trailerBackfill]
      return ors.length > 0 ? within({ OR: ors }) : null
    }
  }
}
