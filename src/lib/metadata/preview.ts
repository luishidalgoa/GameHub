import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { libraryGameWhere, UNFINDABLE } from '@/lib/library'
import { runFields, type BatchField, type BatchMode } from './scope'
import type { ProviderChains } from './chains'
import { gapClausesFor, selectionWhere } from './selection'
import { cachedAggregate } from '@/lib/aggregate-cache'
import { coverQualityOf, lowQualityFields, wrongProvenanceFields } from './field-quality'
import { getProviderMatrix } from './matrix'
import { parseMetadataSources } from './sources'

export type { BatchMode } from './scope'

export interface BatchPreview {
  mode: BatchMode
  /** Games the pass would touch. Null when only the run itself can tell (wrong-provider). */
  games: number | null
  /** Empty fields across those games, for the fill pass. */
  fields?: number
  /** Games the pass leaves alone on purpose: no source could identify them. */
  skippedUnfindable: number
  /** For the quality pass: how many games are low quality in each field. */
  breakdown?: QualityBreakdown
}

export interface PreviewOptions {
  platformSlug?:  string
  /** The fields the pass writes. Undefined = every field the mode allows. */
  fields?:        readonly BatchField[]
  withScores?:    boolean
  popularityRedo?: boolean
  /** The quality pass's minimum cover size, as a multiple of the platform box. */
  coverMinScale?: number
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

  // A quality or provenance pass is judged game by game, with the same rules the run uses.
  if (mode === 'quality' || mode === 'wrong-provider') {
    const where = selectionWhere({ mode, fields, platformSlug: opts.platformSlug, backfillTrailers: true, popularityRedo: false, now: new Date() })
    const judged = where ? await judgedCount(mode, fields, where, opts.coverMinScale) : { games: 0 }
    return { mode, games: judged.games, breakdown: judged.breakdown, skippedUnfindable }
  }

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

/**
 * How many games a judged pass would touch: the games with a field to write under the same
 * rules the run applies to each game, and for a quality pass, how many per field. Cached for
 * a short while, since the panel asks on every change.
 */
async function judgedCount(
  mode: 'quality' | 'wrong-provider',
  fields: readonly BatchField[],
  where: Prisma.GameWhereInput,
  coverMinScale: number | undefined,
): Promise<{ games: number; breakdown?: QualityBreakdown }> {
  const key = `preview-judged:${mode}:${JSON.stringify(where)}:${fields.join(',')}:${coverMinScale ?? ''}`
  return cachedAggregate(key, 20_000, async () => {
    const rows = await db.game.findMany({
      where,
      select: {
        coverPath: true, coverUrl: true, coverWidth: true, coverHeight: true,
        description: true, screenshotPaths: true, metadataSources: true,
        platform: { select: { slug: true, thumbnailWidth: true, thumbnailHeight: true, altThumbnailWidth: true, altThumbnailHeight: true } },
      },
    })
    if (mode === 'wrong-provider') {
      const chains = new Map<string, ProviderChains>()
      for (const slug of new Set(rows.map(r => r.platform.slug))) chains.set(slug, (await getProviderMatrix(slug)).chains)
      const games = rows.filter(r => wrongProvenanceFields(parseMetadataSources(r.metadataSources), fields, chains.get(r.platform.slug)!).length > 0).length
      return { games }
    }
    const breakdown: QualityBreakdown = { cover: 0, coverUnmeasured: 0, description: 0, screenshots: 0 }
    let games = 0
    for (const r of rows) {
      const low = lowQualityFields(r, fields, { coverMinScale })
      if (low.length === 0) continue
      games++
      for (const field of low) {
        if (field === 'cover') {
          const quality = coverQualityOf(r, coverMinScale)
          if (quality === 'unmeasured') breakdown.coverUnmeasured++
          else breakdown.cover++
        } else if (field === 'description') breakdown.description++
        else if (field === 'screenshots') breakdown.screenshots++
      }
    }
    return { games, breakdown }
  })
}

/** Games a quality pass would rewrite, per field. A cover not measured yet is counted apart. */
export type QualityBreakdown = { cover: number; coverUnmeasured: number; description: number; screenshots: number }
