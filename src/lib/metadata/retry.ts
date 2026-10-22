import { db } from '@/lib/db'
import { UNFINDABLE } from '@/lib/library'

/** Days a game nobody could identify waits before the next automatic try. */
export const NO_MATCH_RETRY_DAYS = 14

/** When the next automatic try of a game with no match is due. */
export function noMatchRetryAt(now = Date.now()): Date {
  return new Date(now + NO_MATCH_RETRY_DAYS * 24 * 3600_000)
}

/**
 * Puts unfindable games back in the queue: their status and their retry date are
 * cleared, and the image pass forgets it searched them. Given ids, only those;
 * otherwise every unfindable game. Returns how many were requeued.
 */
export async function requeueUnfindable(ids?: number[]): Promise<number> {
  const where = { ...UNFINDABLE, ...(ids?.length ? { id: { in: ids } } : {}) }
  const res = await db.game.updateMany({
    where,
    data: { metadataStatus: null, metadataNextRetryAt: null, artStatus: null, artCheckedAt: null },
  })
  return res.count
}
