import { db } from '@/lib/db'
import { runMetadataBatch } from './batch'
import type { ScanEvent } from '@/lib/scanner/events'

/**
 * Triggered automatically after a scan adds new games.
 * Reads RAWG key from DB, runs the metadata batch with trailer search,
 * and emits progress back onto the scan bus using auto_meta_* event types.
 */
export async function triggerAutoMetadata(emitScan: (e: ScanEvent) => void): Promise<void> {
  const setting = await db.setting.findUnique({ where: { key: 'rawg_api_key' } })
  const apiKey  = setting?.value || process.env.RAWG_API_KEY

  if (!apiKey) {
    emitScan({ type: 'pipeline_done', message: 'RAWG key not configured — auto-metadata skipped' })
    return
  }

  const controller = new AbortController()

  await runMetadataBatch({
    signal:       controller.signal,
    withCovers:   true,
    withTrailers: true,
    apiKey,
    emit(event) {
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
    },
  })

  emitScan({ type: 'pipeline_done' })
}
