import type { Prisma } from '@prisma/client'
import { libraryGameWhere, NOT_UNFINDABLE, pendingMetadataWhere } from '@/lib/library'
import { FICHA_FIELDS, isArtField, type BatchField, type BatchMode } from './scope'

// Which games a batch pass selects. The batch engine and its preview both build the
// selection here, so the number the admin sees is the number the pass will touch.

/** The column each field leaves empty when it is missing: what a 'fill' pass looks for. */
const GAP_COLUMN: Partial<Record<BatchField, string>> = {
  description: 'description',
  genre:       'genre',
  developer:   'developer',
  publisher:   'publisher',
  releaseYear: 'releaseYear',
  releaseDate: 'releaseDate',
  cover:       'coverPath',
  backdrop:    'backdropPath',
  logo:        'logoPath',
  tile:        'tilePath',
  screenshots: 'screenshotPaths',
  score:       'rawgScore',
  metacritic:  'rawgMetacritic',
  rating:      'rawgRating',
  popularity:  'rawgAdded',
  trailer:     'trailerUrl',
}

/** The columns a 'fill' pass counts as gaps for these fields. A field with no gap column adds none. */
export function gapColumnsFor(fields: readonly BatchField[]): string[] {
  return [...new Set(fields.map(f => GAP_COLUMN[f]).filter((c): c is string => !!c))]
}

/**
 * Every gap a 'fill' pass looks for, as a clause: a column that is empty, or a LaunchBox
 * image kind the game does not have yet.
 */
export function gapClausesFor(fields: readonly BatchField[]): Prisma.GameWhereInput[] {
  const columns = gapColumnsFor(fields).map(column => ({ [column]: null }) as Prisma.GameWhereInput)
  const kinds = fields.filter(isArtField).map(f => ({ images: { none: { kind: f.slice(4) } } }) as Prisma.GameWhereInput)
  return [...columns, ...kinds]
}

export interface SelectionOptions {
  mode:             BatchMode
  /** The fields the run writes (already limited by runFields). */
  fields:           readonly BatchField[]
  platformSlug?:    string
  /** Only games with an id above this (the resume cursor of an interrupted job). */
  resumeAfterId?:   number
  /** 'missing' also takes games that already have metadata but no trailer. */
  backfillTrailers: boolean
  popularityRedo:   boolean
  now:              Date
}

/**
 * The Prisma filter of one pass, or null when nothing can match (no fields, or a 'fill'
 * with no gaps to look at). Unfindable games and disabled platforms are out of every
 * pass, as in the admin's counts.
 */
export function selectionWhere(o: SelectionOptions): Prisma.GameWhereInput | null {
  const fields = o.fields
  if (fields.length === 0) return null

  const trailers = fields.includes('trailer') && o.backfillTrailers
  const hasFicha = fields.some(f => (FICHA_FIELDS as readonly string[]).includes(f))

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
      const gaps = gapClausesFor(fields)
      if (gaps.length === 0) return null
      return within({ OR: gaps })
    }
    case 'missing': {
      const trailerBackfill: Prisma.GameWhereInput[] = trailers ? [{ trailerUrl: null }] : []
      if (hasFicha) return within({ OR: [pendingMetadataWhere(o.now), ...trailerBackfill] })
      // Without the ficha the pass cannot mark a game as done, so it targets the games
      // still lacking something it writes. Once the pass writes it, the game drops out.
      const gaps = gapClausesFor(fields)
      const pendingGaps: Prisma.GameWhereInput[] = gaps.length
        ? [{ AND: [pendingMetadataWhere(o.now), { OR: gaps }] }]
        : []
      const ors = [...pendingGaps, ...trailerBackfill]
      return ors.length > 0 ? within({ OR: ors }) : null
    }
  }
}
