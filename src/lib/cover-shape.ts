import type { Prisma } from '@prisma/client'

/**
 * A stored cover counts as a box when it is taller than wide. Real boxes are about
 * 2:3 (0.67); the threshold leaves room for squarer boxes such as some Game Boy ones.
 * Anything above it is art (a banner, a fanart, a square, a logo) and not a box.
 */
export const BOX_MAX_RATIO = 0.85

export function isBoxRatio(ratio: number | null | undefined): boolean {
  return ratio != null && ratio <= BOX_MAX_RATIO
}

/**
 * Games without a real box: no cover at all, a cover whose proportion is not measured
 * yet, or art that is not a box. Used as a filter, so it works in the API and the admin.
 */
export function noBoxWhere(): Prisma.GameWhereInput {
  return {
    OR: [
      { coverPath: null },
      { coverRatio: null },
      { coverRatio: { gt: BOX_MAX_RATIO } },
    ],
  }
}
