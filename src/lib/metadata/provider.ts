export type MetadataSource = 'rawg' | 'launchbox'

export interface MetadataResult {
  /** Provider game id. RAWG and LaunchBox both use numeric ids. */
  id: number
  slug?: string
  title: string
  description?: string
  releaseYear?: number
  genre?: string
  developer?: string
  publisher?: string
  /** Single best cover URL (box-art front). */
  coverUrl?: string
  /** Additional images (screenshots, fanart) — full URLs. */
  screenshots?: string[]
  esrb?: string
  /** Human platform name as the source reports it (e.g. "Nintendo Game Boy Advance"). */
  platformName?: string
  rating?: number
  source: MetadataSource
  /** RAWG numeric platform IDs (used for confidence scoring). */
  platformIds?: number[]
  /** RAWG platform slugs (e.g. "snes", "game-boy") — used to reject wrong-console matches. */
  platformSlugs?: string[]
}

export interface MetadataProvider {
  search(title: string, platform: string, overrideQuery?: string): Promise<MetadataResult[]>
  fetchById(id: number | string): Promise<MetadataResult | null>
}
