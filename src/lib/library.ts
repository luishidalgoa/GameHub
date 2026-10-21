import type { Prisma } from '@prisma/client'

/** Visible games on an enabled platform: the library as users see it. */
export function libraryGameWhere(platformSlug?: string): Prisma.GameWhereInput {
  return {
    isHidden: false,
    platform: { enabled: true, ...(platformSlug ? { slug: platformSlug } : {}) },
  }
}
