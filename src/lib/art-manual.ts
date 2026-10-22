import { db } from '@/lib/db'
import { deleteManyFromS3 } from '@/lib/s3'

/**
 * Manual art the owner removed stays in the bucket for this long, so the removal can
 * be undone. After it, the object is deleted (purgeExpiredManualArt).
 */
export const REMOVAL_WINDOW_MS = 10 * 60 * 1000

export type ManualKind = 'fanart' | 'banner' | 'logo'

/** The game fields a manual image of this kind fills. */
export function fieldsFor(kind: ManualKind, path: string): Record<string, unknown> {
  if (kind === 'logo') return { logoPath: path }
  if (kind === 'banner') return { backdropPath: path, backdropKind: 'banner', tilePath: path }
  return { tilePath: path, backdropPath: path, backdropKind: 'fanart' }
}

export function isInWindow(removedAt: Date, now = Date.now()): boolean {
  return now - removedAt.getTime() < REMOVAL_WINDOW_MS
}

/** Deletes the removed manual images whose window has closed. Returns how many. */
export async function purgeExpiredManualArt(now = Date.now()): Promise<number> {
  const expired = await db.gameImage.findMany({
    where: { removedAt: { lt: new Date(now - REMOVAL_WINDOW_MS) } },
    select: { id: true, s3Key: true },
  })
  if (expired.length === 0) return 0
  await deleteManyFromS3(expired.map(e => e.s3Key)).catch(() => 0)
  await db.gameImage.deleteMany({ where: { id: { in: expired.map(e => e.id) } } })
  return expired.length
}

export { categoryOf, slotOf, isManualKind, type ArtCategory } from '@/lib/art-catalog'
