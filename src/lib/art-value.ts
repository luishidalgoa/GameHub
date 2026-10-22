/**
 * What makes a game worth manual art (#142). Rich metadata is the floor: art is
 * found by title and metadata, so a thin record cannot be matched well. On top of
 * that the game must matter to someone: popular on RAWG, or downloaded here.
 */
export interface ArtValueFields {
  description: string | null
  releaseYear: number | null
  developer: string | null
  genre: string | null
  rawgAdded: number | null
}

export const RICH_DESCRIPTION_MIN = 120

export function hasRichMetadata(g: ArtValueFields): boolean {
  return (g.description?.trim().length ?? 0) >= RICH_DESCRIPTION_MIN
    && g.releaseYear != null
    && !!g.developer?.trim()
    && !!g.genre?.trim()
}

export function isValuableForArt(g: ArtValueFields, downloaded: boolean): boolean {
  return hasRichMetadata(g) && ((g.rawgAdded ?? 0) > 0 || downloaded)
}
