import type { Prisma } from '@prisma/client'

/** Visible games on an enabled platform: the library as users see it. */
/** "Sin portada": no hay fichero guardado ni URL remota. Un solo criterio para contar y filtrar (#121). */
export const NO_COVER = { coverPath: null, coverUrl: null } as const

/** "Sin nota": no hay puntuacion unificada. Un solo criterio para contar y filtrar (#121). */
export const NO_SCORE = { rawgScore: null } as const

export function libraryGameWhere(platformSlug?: string): Prisma.GameWhereInput {
  return {
    isHidden: false,
    platform: { enabled: true, ...(platformSlug ? { slug: platformSlug } : {}) },
  }
}

/**
 * Games no source could identify: LaunchBox has no match for them (artStatus) and
 * the fallback sources came back empty too (metadataStatus). They are kept out of the
 * pending lists, so a title that cannot be found does not sit in them forever. They
 * are listed apart, for hand entry or a later source.
 */
export const UNFINDABLE: Prisma.GameWhereInput = { artStatus: 'no-match', metadataStatus: 'no_match' }

/** A pending list: games missing the given fields that some source can still fill. */
export function pendingWhere(missing: Prisma.GameWhereInput): Prisma.GameWhereInput {
  return { AND: [missing, { NOT: UNFINDABLE }] }
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
