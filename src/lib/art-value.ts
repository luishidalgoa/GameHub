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

export type ArtView = 'valiosos' | 'todos' | 'pobres'
export type ArtMissing = 'fondo' | 'logo' | 'ambos'

export interface ArtFilter {
  vista: ArtView
  falta: ArtMissing
  /** Platform name, or 'todas'. */
  plataforma: string
}

export const DEFAULT_ART_FILTER: ArtFilter = { vista: 'valiosos', falta: 'ambos', plataforma: 'todas' }

export interface ArtCandidate extends ArtValueFields {
  id: number
  backdropPath: string | null
  logoPath: string | null
  platformName: string
}

/**
 * The games a filter selects, one entry per missing kind. Every game stays
 * reachable: the view decides the pool, the other fields narrow it. Nothing is
 * dropped silently: the page shows how many each view holds.
 */
export function selectArtGames(games: ArtCandidate[], filter: ArtFilter, downloaded: Set<number>): { id: number; missing: 'fanart' | 'logo' }[] {
  const pool = games.filter(g => {
    if (filter.plataforma !== 'todas' && g.platformName !== filter.plataforma) return false
    if (filter.vista === 'valiosos') return isValuableForArt(g, downloaded.has(g.id))
    if (filter.vista === 'pobres') return !hasRichMetadata(g)
    return true
  })
  const out: { id: number; missing: 'fanart' | 'logo' }[] = []
  for (const g of pool) {
    if (filter.falta !== 'logo' && !g.backdropPath) out.push({ id: g.id, missing: 'fanart' })
    if (filter.falta !== 'fondo' && !g.logoPath) out.push({ id: g.id, missing: 'logo' })
  }
  return out
}
