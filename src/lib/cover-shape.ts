import type { Prisma } from '@prisma/client'

/**
 * Each platform cuts its cards to its own proportion (width / height), set in the
 * platform's thumbnailWidth/thumbnailHeight. A cover is a box when its proportion
 * is within this relative tolerance of that platform's box. Anything else is art
 * (a banner, a fanart, a logo) and is shown as art instead of a box.
 */
export const BOX_TOLERANCE = 0.15

/** Proportion used when a platform has no usable size: the common 2:3 box. */
export const DEFAULT_BOX_RATIO = 2 / 3

/** The proportion a platform's cards are cut to, from its stored size. */
export function boxRatioOf(
  thumbnailWidth: number | null | undefined,
  thumbnailHeight: number | null | undefined,
): number {
  return thumbnailWidth && thumbnailHeight && thumbnailWidth > 0 && thumbnailHeight > 0
    ? thumbnailWidth / thumbnailHeight
    : DEFAULT_BOX_RATIO
}

/**
 * The proportion of a platform's secondary box (its altThumbnailWidth/altThumbnailHeight), as a
 * list for the alternates below. Some platforms came in a second official format (Saturn's
 * square covers, by region): a cover of that shape is a box too, kept whole instead of cropped.
 * Empty when the platform has no secondary box.
 */
export function altBoxRatiosOf(
  altThumbnailWidth: number | null | undefined,
  altThumbnailHeight: number | null | undefined,
): number[] {
  return altThumbnailWidth && altThumbnailHeight && altThumbnailWidth > 0 && altThumbnailHeight > 0
    ? [altThumbnailWidth / altThumbnailHeight]
    : []
}

/** The proportions a cover may have and still be a box for a platform. */
export function boxBounds(boxRatio: number): { low: number; high: number } {
  return { low: boxRatio * (1 - BOX_TOLERANCE), high: boxRatio * (1 + BOX_TOLERANCE) }
}

function withinBox(ratio: number, boxRatio: number): boolean {
  const { low, high } = boxBounds(boxRatio)
  return ratio >= low && ratio <= high
}

/**
 * Which box a stored cover has: the platform's main box, one of its official alternates,
 * or none (art). Without a ratio there is no box.
 */
export function boxFitOf(
  ratio: number | null | undefined,
  boxRatio: number = DEFAULT_BOX_RATIO,
  alternates: readonly number[] = [],
): 'main' | 'alt' | 'none' {
  if (ratio == null) return 'none'
  if (withinBox(ratio, boxRatio)) return 'main'
  return alternates.some(a => withinBox(ratio, a)) ? 'alt' : 'none'
}

/** True when a stored cover has the proportion of the platform's box, or of one of its alternates. */
export function isBoxRatio(
  ratio: number | null | undefined,
  boxRatio: number = DEFAULT_BOX_RATIO,
  alternates: readonly number[] = [],
): boolean {
  return boxFitOf(ratio, boxRatio, alternates) !== 'none'
}

/** Games of one platform without a real box: no cover, no measured ratio, or art. */
export function noBoxForPlatform(boxRatio: number, alternates: readonly number[] = []): Prisma.GameWhereInput {
  // Outside every box of the platform: the ratio falls out of each one's bounds.
  const outside = [boxRatio, ...alternates].map(r => {
    const { low, high } = boxBounds(r)
    return { OR: [{ coverRatio: { lt: low } }, { coverRatio: { gt: high } }] }
  })
  return {
    OR: [
      { coverPath: null },
      { coverRatio: null },
      { AND: outside },
    ],
  }
}

/**
 * Games without a real box, each judged against its own platform's boxes. Platforms
 * missing from `boxes` are not matched, so pass every platform you want counted.
 */
export function noBoxWhereByPlatform(
  boxes: Array<{ platformId: number; boxRatio: number; alternates?: readonly number[] }>,
): Prisma.GameWhereInput {
  return {
    OR: boxes.map(b => ({ AND: [{ platformId: b.platformId }, noBoxForPlatform(b.boxRatio, b.alternates ?? [])] })),
  }
}
