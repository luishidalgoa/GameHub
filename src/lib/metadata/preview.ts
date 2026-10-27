import { db } from '@/lib/db'
import { libraryGameWhere, UNFINDABLE } from '@/lib/library'
import { runFields, type BatchField, type BatchMode } from './scope'
import { gapClausesFor, selectionWhere } from './selection'

export type { BatchMode } from './scope'

export interface BatchPreview {
  mode: BatchMode
  /** Games the pass would touch. Null when only the run itself can tell (wrong-provider). */
  games: number | null
  /** Empty fields across those games, for the fill pass. */
  fields?: number
  /** Games the pass leaves alone on purpose: no source could identify them. */
  skippedUnfindable: number
}

export interface PreviewOptions {
  platformSlug?:  string
  /** The fields the pass writes. Undefined = every field the mode allows. */
  fields?:        readonly BatchField[]
  withScores?:    boolean
  popularityRedo?: boolean
}

/**
 * What a batch pass would touch, counted before anything runs. It asks the same
 * selection the engine runs (selection.ts), so the two cannot disagree.
 */
export async function previewBatch(mode: BatchMode, opts: PreviewOptions = {}): Promise<BatchPreview> {
  const withScores = opts.withScores ?? true
  // Trailers are on in a run unless the caller turns them off, and the job does not.
  const fields = runFields(mode, opts.fields, { withTrailers: true, withScores })
  const skippedUnfindable = await db.game.count({ where: { ...libraryGameWhere(opts.platformSlug), ...UNFINDABLE } })

  // wrong-provider needs each game's source to know whether it is wrong.
  if (mode === 'wrong-provider') return { mode, games: null, skippedUnfindable }

  const where = selectionWhere({
    mode, fields,
    platformSlug:    opts.platformSlug,
    backfillTrailers: true,
    popularityRedo:  opts.popularityRedo ?? false,
    now:             new Date(),
  })
  if (!where) return { mode, games: 0, skippedUnfindable }

  const games = await db.game.count({ where })
  if (mode !== 'fill') return { mode, games, skippedUnfindable }

  let empty = 0
  for (const gap of gapClausesFor(fields)) {
    empty += await db.game.count({ where: { AND: [where, gap] } })
  }
  return { mode, games, fields: empty, skippedUnfindable }
}
