/**
 * Provenance of each metadata field — the JSON stored in `Game.metadataSources`.
 *
 * Every field records WHERE its current value came from, so the editor can show
 * an honest badge and the 'wrong-provider' sweep can tell which games disagree
 * with the configured provider matrix.
 *
 * Beyond the four automated providers there are three manual origins, because a
 * cover can also be set by hand: picked from a search tab, pasted as a URL, or
 * uploaded/dropped. Recording those honestly is the point — a cover the admin
 * chose used to keep whatever badge the batch had left behind.
 */

/** Where a stored field came from. The first four are automated providers. */
export type FieldSource =
  | 'launchbox' | 'rawg' | 'steamgriddb' | 'libretro'
  | 'upload'      // a file dropped, pasted or picked from disk
  | 'url'         // pasted image URL
  | 'screenshot'  // promoted from one of the game's screenshots

export interface MetadataSources {
  cover?:       FieldSource
  info?:        FieldSource
  description?: FieldSource
  screenshots?: FieldSource
  /**
   * The cover was chosen by hand in the editor.
   *
   * Automated sweeps must leave it alone: without this flag, recording the real
   * source of a hand-picked cover would make 'wrong-provider' see a mismatch
   * against the matrix and replace exactly the image the admin went out of their
   * way to choose. Only 'redo' — the explicit "rebuild everything" mode —
   * overrides it.
   */
  coverManual?: boolean
}

/** Values `POST /api/covers` accepts as a cover origin. */
export const COVER_SOURCES = [
  'launchbox', 'rawg', 'steamgriddb', 'libretro', 'upload', 'url', 'screenshot',
] as const

export function isCoverSource(v: unknown): v is FieldSource {
  return typeof v === 'string' && (COVER_SOURCES as readonly string[]).includes(v)
}

/** Parse the stored JSON, tolerating null/garbage (never throws). */
export function parseMetadataSources(json: string | null | undefined): MetadataSources {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? parsed as MetadataSources : {}
  } catch {
    return {}
  }
}
