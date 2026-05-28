import type { Platform } from './platform'

export interface GameDlc {
  id: number
  gameId: number
  filePath: string
  fileName: string
  fileSize: string
  title: string | null
  type: string   // "dlc" | "update"
}

export interface Game {
  id: number
  filePath: string
  fileName: string
  fileSize: string
  platformId: number
  platform?: Platform
  title: string
  sortTitle: string | null
  region: string | null
  releaseYear: number | null
  genre: string | null
  developer: string | null
  publisher: string | null
  coverPath: string | null
  coverUrl: string | null
  trailerUrl: string | null
  screenshotPaths: string | null
  description: string | null
  customNotes: string | null
  externalLinks: string | null
  groupKey: string | null
  igdbId: number | null
  rawgId: number | null
  rawgSlug: string | null
  isFavorite: boolean
  isHidden: boolean
  playCount: number
  lastPlayedAt: Date | string | null
  lastSeenAt: Date | string
  metadataFetchedAt: Date | string | null
  dlcs?: GameDlc[]
  createdAt: Date | string
  updatedAt: Date | string
}

export type GameListItem = Pick<
  Game,
  | 'id'
  | 'title'
  | 'sortTitle'
  | 'region'
  | 'releaseYear'
  | 'genre'
  | 'coverPath'
  | 'coverUrl'
  | 'isFavorite'
  | 'isHidden'
  | 'platformId'
  | 'fileSize'
  | 'metadataFetchedAt'
>
