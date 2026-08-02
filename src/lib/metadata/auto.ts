import { db } from '@/lib/db'
import { runMetadataBatch } from './batch'
import type { BatchEvent } from './batch'
import type { ScanEvent } from '@/lib/scanner/events'

/** Map a metadata-batch event onto the scan bus (auto_meta_* event types). */
function makeBatchEmitter(emitScan: (e: ScanEvent) => void) {
  return (event: BatchEvent) => {
    switch (event.type) {
      case 'start':
        emitScan({ type: 'auto_meta_start', total: event.total })
        break
      case 'applied':
      case 'skipped':
      case 'failed':
        emitScan({
          type:         'auto_meta_progress',
          metaStatus:   event.type,
          gameTitle:    event.title,
          confidence:   event.confidence,
          trailerFound: event.trailerFound,
          processed:    event.processed,
          total:        event.total,
        })
        break
      case 'done':
        emitScan({
          type:    'auto_meta_done',
          added:   event.applied,
          skipped: event.skipped,
          failed:  event.failed,
          total:   event.total,
        })
        break
    }
  }
}

/**
 * Triggered automatically after a scan adds new games.
 * Reads the RAWG key from the DB, then runs two passes, emitting progress back
 * onto the scan bus as auto_meta_* events:
 *   1. metadata  — covers / info / trailer / score for games that have none.
 *   2. ratings   — RAWG popularity metrics ('popularity' mode). It only touches
 *                  games with a rawgId and no popularityFetchedAt, i.e. exactly
 *                  the ones just matched in pass 1 → ratings for NEW games only.
 *
 * The score is resolved in pass 1, not pass 2: pass 2 needs a rawgId, and with
 * LaunchBox as the default info provider most newly scanned games never get one,
 * so their score would silently never be fetched. Pass 1's chain works without
 * it (Metacritic scraper → LaunchBox community rating), and pass 2 then leaves
 * an already-resolved score alone unless RAWG has a real metascore.
 */
export async function triggerAutoMetadata(
  emitScan: (e: ScanEvent) => void,
  /** When the scan targeted a single platform, restrict auto-metadata to it so
   *  we don't fetch metadata for games of OTHER platforms that happen to lack it. */
  platformSlug?: string,
): Promise<void> {
  const setting = await db.setting.findUnique({ where: { key: 'rawg_api_key' } })
  const apiKey  = setting?.value || process.env.RAWG_API_KEY

  if (!apiKey) {
    emitScan({ type: 'pipeline_done', message: 'RAWG key not configured — auto-metadata skipped' })
    return
  }

  const controller = new AbortController()
  const emit = makeBatchEmitter(emitScan)

  // Pass 1 — metadata (covers / info / trailer).
  await runMetadataBatch({
    signal:       controller.signal,
    withCovers:   true,
    withTrailers: true,
    apiKey,
    platformSlug,
    emit,
  })

  // Pass 2 — ratings/score for the games that just got a rawgId (the new ones).
  await runMetadataBatch({
    signal: controller.signal,
    mode:   'popularity',
    apiKey,
    platformSlug,
    emit,
  })

  emitScan({ type: 'pipeline_done' })
}
