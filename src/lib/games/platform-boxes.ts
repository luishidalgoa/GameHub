import { db } from '@/lib/db'
import { boxRatioOf } from '@/lib/cover-shape'

/** Each platform's box proportion, for judging which covers are boxes. */
export async function platformBoxes(): Promise<Array<{ platformId: number; boxRatio: number }>> {
  const platforms = await db.platform.findMany({ select: { id: true, thumbnailWidth: true, thumbnailHeight: true } })
  return platforms.map(p => ({ platformId: p.id, boxRatio: boxRatioOf(p.thumbnailWidth, p.thumbnailHeight) }))
}
