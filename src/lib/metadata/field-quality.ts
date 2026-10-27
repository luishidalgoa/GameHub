import { COVER_MIN_SCALE, type ProviderChains } from './chains'
import type { BatchField } from './scope'
import type { MetadataSources } from './sources'

// The quality of a game's fields, judged field by field. A field is either good, or it
// is low quality and a quality pass rewrites it. The rules are what this app can measure:
//
//   cover        a cover at least COVER_MIN_SCALE times the platform's box, on each side.
//                Its size is read when it is stored (Game.coverWidth/coverHeight). A cover
//                whose size is not known yet is low quality until it is measured again.
//   description  at least DESCRIPTION_MIN_CHARS characters.
//   screenshots  at least SCREENSHOTS_MIN screenshots.
//
// Nothing else has a quality measure here: a field that is only present or absent is not
// offered by the quality pass.

export const DESCRIPTION_MIN_CHARS = 120
export const SCREENSHOTS_MIN = 3

/** The fields a quality pass can rewrite, because each one has a measure above. */
export const QUALITY_FIELDS: readonly BatchField[] = ['cover', 'description', 'screenshots']

export interface QualityGame {
  coverPath: string | null
  coverUrl: string | null
  coverWidth: number | null
  coverHeight: number | null
  description: string | null
  screenshotPaths: string | null
  platform: { thumbnailWidth: number; thumbnailHeight: number }
}

/** A cover's size as a multiple of the platform's target (box × COVER_MIN_SCALE): 1 and above is good. */
export function coverScaleOf(width: number, height: number, box: { thumbnailWidth: number; thumbnailHeight: number }): number {
  const w = Math.max(1, box.thumbnailWidth) * COVER_MIN_SCALE
  const h = Math.max(1, box.thumbnailHeight) * COVER_MIN_SCALE
  return Math.min(width / w, height / h)
}

function screenshotCount(json: string | null): number {
  if (!json) return 0
  try {
    const list = JSON.parse(json) as unknown
    return Array.isArray(list) ? list.length : 0
  } catch {
    return 0
  }
}

/** The fields of the game that are low quality, among the ones asked. */
export function lowQualityFields(game: QualityGame, asked: readonly BatchField[]): BatchField[] {
  return asked.filter(field => {
    if (field === 'cover') {
      if (!game.coverPath && !game.coverUrl) return true
      if (game.coverWidth == null || game.coverHeight == null) return true
      return coverScaleOf(game.coverWidth, game.coverHeight, game.platform) < 1
    }
    if (field === 'description') return (game.description?.trim().length ?? 0) < DESCRIPTION_MIN_CHARS
    if (field === 'screenshots') return screenshotCount(game.screenshotPaths) < SCREENSHOTS_MIN
    return false
  })
}

/** The fields whose source is not one of the platform's chain for them: the provenance is wrong or missing. */
export function wrongProvenanceFields(src: MetadataSources, asked: readonly BatchField[], chains: ProviderChains): BatchField[] {
  // A source of the chain may answer: a fallback is by design. Nintendo's store is the Switch info fallback.
  const outside = (from: string | undefined, chain: readonly string[], extra: readonly string[] = []) =>
    chain.length > 0 && !(from && (chain.includes(from) || extra.includes(from)))

  return asked.filter(field => {
    switch (field) {
      case 'cover':
        // A hand-picked cover is a deliberate override, not a drift.
        return !src.coverManual && outside(src.cover, chains.cover)
      case 'screenshots':
        return outside(src.screenshots, chains.screenshots)
      case 'description':
        return outside(src.description, chains.description)
      case 'genre':
      case 'developer':
      case 'publisher':
      case 'releaseYear':
        return outside(src.facts?.[field] ?? src.info, chains.info, ['nintendo'])
      case 'title':
      case 'releaseDate':
        return outside(src.info, chains.info, ['nintendo'])
      default:
        return false
    }
  })
}
