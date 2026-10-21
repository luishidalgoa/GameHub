import type { Prisma } from '@prisma/client'

/** Visible games on an enabled platform: the library as users see it. */
export function libraryGameWhere(platformSlug?: string): Prisma.GameWhereInput {
  return {
    isHidden: false,
    platform: { enabled: true, ...(platformSlug ? { slug: platformSlug } : {}) },
  }
}

/**
 * Without metadata: never fetched AND no sheet data (description, genre). Data
 * that came from another source (embedded, imported, edited) counts as metadata.
 */
export const WITHOUT_METADATA: Prisma.GameWhereInput = {
  metadataFetchedAt: null,
  description: null,
  genre: null,
}

export function hasMetadata(game: { metadataFetchedAt: Date | string | null; description: string | null; genre: string | null }): boolean {
  return game.metadataFetchedAt !== null || Boolean(game.description) || Boolean(game.genre)
}
