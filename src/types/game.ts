import type { Platform } from './platform'

export interface GameDlc {
  id: number
  gameId: number
  filePath: string
  fileName: string
  fileSize: string
  title: string | null
  type: string   // "dlc" | "update" | "mod" | "region"
  titleId: string | null
  region: string | null
  languages: string | null
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
  languages: string | null
  releaseYear: number | null
  genre: string | null
  developer: string | null
  publisher: string | null
  coverPath: string | null
  coverUrl: string | null
  trailerUrl: string | null
  screenshotPaths: string | null
  metadataSources: string | null
  description: string | null
  customNotes: string | null
  externalLinks: string | null
  groupKey: string | null
  /** Title ID de Nintendo (16 hex) puesto a mano cuando el nombre del fichero
   *  no lo trae. Sin el, la tienda no puede cruzar el juego con su titledb. */
  titleId: string | null
  igdbId: number | null
  rawgId: number | null
  rawgSlug: string | null
  rawgAdded: number | null
  rawgRating: number | null
  rawgMetacritic: number | null
  rawgScore: number | null
  scoreSource: string | null
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
> & {
  // Popularity/quality metrics (for the rating badge + sort). Null when the
  // popularity sync hasn't run for this game.
  rawgRating?:     number | null
  rawgMetacritic?: number | null
  rawgAdded?:      number | null
  rawgScore?:      number | null
}
