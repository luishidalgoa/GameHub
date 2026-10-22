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

/** The categories the editor sorts images into. */
export type ArtCategory = 'cover' | 'banner' | 'fanart' | 'logo' | 'screenshot' | 'other'

/** The category of a stored image (GameImage.kind), manual or from LaunchBox. */
export function categoryOf(kind: string): ArtCategory {
  switch (kind) {
    case 'box-front':
    case 'box-front-reconstructed':
      return 'cover'
    case 'banner':
    case 'manual-banner':
      return 'banner'
    case 'fanart':
    case 'manual-fanart':
      return 'fanart'
    case 'clear-logo':
    case 'manual-logo':
      return 'logo'
    case 'screenshot-gameplay':
    case 'screenshot-game-title':
    case 'manual-screenshot':
      return 'screenshot'
    default:
      return 'other'
  }
}

/** The game art slot an image of this kind can fill (the cover and the screenshots have their own). */
export function slotOf(kind: string): ManualKind | null {
  const c = categoryOf(kind)
  return c === 'banner' || c === 'fanart' || c === 'logo' ? c : null
}

/** True for the images the owner brought in: only those can be removed. */
export function isManualKind(kind: string): boolean {
  return kind.startsWith('manual-')
}
