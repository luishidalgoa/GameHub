export interface MetadataResult {
  id: number
  slug: string
  title: string
  description?: string
  releaseYear?: number
  genre?: string
  developer?: string
  publisher?: string
  coverUrl?: string
  rating?: number
  source: 'rawg'
  /** RAWG numeric platform IDs present on this game — used for confidence scoring */
  platformIds?: number[]
}

export interface MetadataProvider {
  search(title: string, platform: string, overrideQuery?: string): Promise<MetadataResult[]>
  fetchById(id: number | string): Promise<MetadataResult | null>
}
