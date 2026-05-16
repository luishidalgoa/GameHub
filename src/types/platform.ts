export interface Platform {
  id: number
  slug: string
  name: string
  scanPath: string
  extensions: string
  iconPath: string | null
  scanMode: string
  sortOrder: number
  enabled: boolean
  thumbnailWidth: number
  thumbnailHeight: number
  _count?: { games: number }
  createdAt: Date | string
  updatedAt: Date | string
}
