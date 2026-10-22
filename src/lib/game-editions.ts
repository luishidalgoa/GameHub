/** One downloadable edition of a game: the primary file (dlcId undefined) or a region GameDlc. */
export interface Edition {
  key: string
  dlcId?: number
  region: string | null
  languages: string[]
  fileSize: string
}

/**
 * Which edition the region badges start on: the region the grid's region filter
 * was set to (passed as `?region=`), else EUR, else the first edition.
 */
export function pickEditionKey(editions: Edition[], requested?: string | null): string | undefined {
  const byRegion = (r: string) => editions.find((e) => e.region === r)?.key
  return (requested && byRegion(requested)) || byRegion('EUR') || editions[0]?.key
}
