import { db } from '@/lib/db'
import { altBoxRatiosOf, boxRatioOf } from '@/lib/cover-shape'

/** Each platform's box proportion and its official alternates, for judging which covers are boxes. */
export async function platformBoxes(): Promise<Array<{ platformId: number; boxRatio: number; alternates: number[] }>> {
  const platforms = await db.platform.findMany({
    select: { id: true, thumbnailWidth: true, thumbnailHeight: true, altThumbnailWidth: true, altThumbnailHeight: true },
  })
  return platforms.map(p => ({
    platformId: p.id,
    boxRatio: boxRatioOf(p.thumbnailWidth, p.thumbnailHeight),
    alternates: altBoxRatiosOf(p.altThumbnailWidth, p.altThumbnailHeight),
  }))
}
