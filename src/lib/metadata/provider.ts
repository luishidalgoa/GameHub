export interface MetadataResult {
  id: number
  slug?: string
  title: string
  description?: string
  releaseYear?: number
  genre?: string
  developer?: string
  publisher?: string
  coverUrl?: string
  rating?: number
  source: 'rawg'
  platformIds?: number[]
}

export interface MetadataProvider {
  search(title: string, platform: string, overrideQuery?: string): Promise<MetadataResult[]>
  fetchById(id: number | string): Promise<MetadataResult | null>
}
