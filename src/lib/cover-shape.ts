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

/** The proportions a cover may have and still be a box for a platform. */
export function boxBounds(boxRatio: number): { low: number; high: number } {
  return { low: boxRatio * (1 - BOX_TOLERANCE), high: boxRatio * (1 + BOX_TOLERANCE) }
}

/** True when a stored cover has the proportion of the platform's box. */
export function isBoxRatio(ratio: number | null | undefined, boxRatio: number = DEFAULT_BOX_RATIO): boolean {
  if (ratio == null) return false
  const { low, high } = boxBounds(boxRatio)
  return ratio >= low && ratio <= high
}

/** Games of one platform without a real box: no cover, no measured ratio, or art. */
export function noBoxForPlatform(boxRatio: number): Prisma.GameWhereInput {
  const { low, high } = boxBounds(boxRatio)
  return {
    OR: [
      { coverPath: null },
      { coverRatio: null },
      { coverRatio: { lt: low } },
      { coverRatio: { gt: high } },
    ],
  }
}

/**
 * Games without a real box, each judged against its own platform's box. Platforms
 * missing from `boxes` are not matched, so pass every platform you want counted.
 */
export function noBoxWhereByPlatform(
  boxes: Array<{ platformId: number; boxRatio: number }>,
): Prisma.GameWhereInput {
  return {
    OR: boxes.map(b => ({ AND: [{ platformId: b.platformId }, noBoxForPlatform(b.boxRatio)] })),
  }
}
