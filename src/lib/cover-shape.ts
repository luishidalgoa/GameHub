import type { Prisma } from '@prisma/client'

/**
 * A stored cover counts as a box up to this proportion (width / height). Real boxes
 * run from 2:3 (0.67) to nearly square (about 1.1: some 3DS and GameCube boxes).
 * Banners and fanarts are about 16:9 (1.78), so they fall above it and are shown as art.
 * A square piece of art cannot be told from a square box by shape alone, so it counts as a box.
 */
export const BOX_MAX_RATIO = 1.25

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
