import { altBoxRatiosOf, boxFitOf, boxRatioOf } from '@/lib/cover-shape'
import { COVER_MIN_SCALE, type ProviderChains } from './chains'
import type { BatchField } from './scope'
import type { MetadataSources } from './sources'

// The quality of a game's fields, judged field by field. A field is either good, or it
// is low quality and a quality pass rewrites it. The rules are what this app can measure:
//
//   cover        at least `coverMinScale` times the platform's box, on each side (default
//                COVER_MIN_SCALE, twice the box). The picture's size is read when it is
//                stored, or by the measurement (Game.coverWidth/coverHeight). A cover
//                whose size is not known yet is "unmeasured": it counts as low quality
//                until it is measured. A size of 0×0 means the picture could not be read.
//   description  at least DESCRIPTION_MIN_CHARS characters.
//   screenshots  at least SCREENSHOTS_MIN screenshots.
//
// Nothing else has a quality measure here: a field that is only present or absent is not
// offered by the quality pass.

export const DESCRIPTION_MIN_CHARS = 120
export const SCREENSHOTS_MIN = 3

/** The lowest multiple of the box the slider can ask for, and the highest. */
export const COVER_SCALE_RANGE = { min: 0.5, max: 3, step: 0.25 } as const

/** The fields a quality pass can rewrite, because each one has a measure above. */
export const QUALITY_FIELDS: readonly BatchField[] = ['cover', 'description', 'screenshots']

export interface QualityGame {
  coverPath: string | null
  coverUrl: string | null
  coverWidth: number | null
  coverHeight: number | null
  description: string | null
  screenshotPaths: string | null
  platform: {
    thumbnailWidth: number
    thumbnailHeight: number
    altThumbnailWidth?: number | null
    altThumbnailHeight?: number | null
  }
}

export type CoverQuality = 'good' | 'small' | 'unmeasured' | 'missing'

/** A cover's size as a multiple of the platform's target (box × minScale): 1 and above is good. */
export function coverScaleOf(
  width: number,
  height: number,
  box: { thumbnailWidth: number; thumbnailHeight: number },
  minScale: number = COVER_MIN_SCALE,
): number {
  const w = Math.max(1, box.thumbnailWidth) * minScale
  const h = Math.max(1, box.thumbnailHeight) * minScale
  return Math.min(width / w, height / h)
}

/**
 * How good a game's cover is, at this minimum scale. A cover of the platform's secondary box
 * is judged against that box, not the main one.
 */
export function coverQualityOf(game: QualityGame, minScale: number = COVER_MIN_SCALE): CoverQuality {
  if (!game.coverPath && !game.coverUrl) return 'missing'
  if (game.coverWidth == null || game.coverHeight == null) return 'unmeasured'
  const { platform } = game
  const ratio = game.coverWidth / game.coverHeight
  const mainRatio = boxRatioOf(platform.thumbnailWidth, platform.thumbnailHeight)
  const onSecondary = boxFitOf(ratio, mainRatio, altBoxRatiosOf(platform.altThumbnailWidth, platform.altThumbnailHeight)) === 'alt'
  const box = onSecondary
    ? { thumbnailWidth: platform.altThumbnailWidth!, thumbnailHeight: platform.altThumbnailHeight! }
    : platform
  return coverScaleOf(game.coverWidth, game.coverHeight, box, minScale) < 1 ? 'small' : 'good'
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

export interface QualityOptions {
  /** The cover's minimum size as a multiple of the platform box. Default COVER_MIN_SCALE. */
  coverMinScale?: number
}

/** The fields of the game that are low quality, among the ones asked. */
export function lowQualityFields(game: QualityGame, asked: readonly BatchField[], opts: QualityOptions = {}): BatchField[] {
  const minScale = opts.coverMinScale ?? COVER_MIN_SCALE
  return asked.filter(field => {
    if (field === 'cover') {
      const quality = coverQualityOf(game, minScale)
      return quality !== 'good'
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

/** A minimum cover scale from a request: a number inside the slider's range, else undefined (the default). */
export function clampCoverScale(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  return Math.min(COVER_SCALE_RANGE.max, Math.max(COVER_SCALE_RANGE.min, n))
}
