import { probeCoverImage, type CoverProbe } from '@/lib/cover-probe'
import { altBoxRatiosOf, boxFitOf, boxRatioOf } from '@/lib/cover-shape'
import { COVER_MIN_SCALE, type CoverSource } from './chains'

export { COVER_MIN_SCALE }

// The cover chain: every source of the platform's chain gives its cover, and the one that
// fits the platform best is kept. "Best" is judged in this order (see coverKey):
//
//   1. the cover is a box: the platform's main box or its secondary one. Art (a banner, a
//      logo) is never preferred over a box, whatever its size.
//   2. the cover is big enough for its box (COVER_MIN_SCALE times the box, on each side).
//   3. the main box before the secondary one.
//   4. among covers that are still too small, the largest.
//
// Ties keep the earlier source of the chain. A cover that is already the best possible
// (a main box, big enough) ends the walk: no later source can beat it, so it is not downloaded.

const DEFAULT_BOX = { width: 200, height: 300 }

/** A platform's box: its main size, and its secondary one when it has one (both in pixels). */
export interface PlatformCoverBox {
  width: number
  height: number
  altWidth?: number | null
  altHeight?: number | null
}

export interface CoverCandidate {
  coverUrl: string
  source: CoverSource
  buffer: Buffer
  width: number
  height: number
  /** The cover's size as a multiple of the target (box × COVER_MIN_SCALE): 1 and above is good quality. */
  scale: number
}

export interface CoverChoiceInput {
  /** The sources to ask, in order. Empty means no cover. */
  chain: readonly CoverSource[]
  /** The URL a source gives for this game, or null. A source without an entry is skipped. */
  urls: Partial<Record<CoverSource, () => Promise<string | null>>>
  /** The platform's box, in pixels. */
  box?: PlatformCoverBox
  /** Reads a candidate's size and bytes. Injected by the tests; the default downloads the image. */
  probe?: (url: string) => Promise<CoverProbe | null>
}

export function coverScale(width: number, height: number, box: { width: number; height: number }): number {
  const w = Math.max(1, box.width) * COVER_MIN_SCALE
  const h = Math.max(1, box.height) * COVER_MIN_SCALE
  return Math.min(width / w, height / h)
}

/** Which box a cover is: the platform's main box, its secondary one, or none (art). */
export function coverFit(width: number, height: number, box: PlatformCoverBox): 'main' | 'alt' | 'none' {
  if (!width || !height) return 'none'
  return boxFitOf(
    width / height,
    boxRatioOf(box.width, box.height),
    altBoxRatiosOf(box.altWidth, box.altHeight),
  )
}

/**
 * How well a cover fits a platform, as a list to compare in order (see the header above):
 * [is a box, is big enough, is the main box, how small it is when it is not big enough].
 * Higher is better.
 */
export function coverKey(width: number, height: number, box: PlatformCoverBox): number[] {
  const fit = coverFit(width, height, box)
  const scale = width && height ? coverScale(width, height, boxOf(fit, box)) : 0
  const big = scale >= 1
  return [fit === 'none' ? 0 : 1, big ? 1 : 0, fit === 'main' ? 1 : 0, big ? 0 : scale]
}

/** The box a cover is judged against: its own shape's box (the secondary one for an alternate cover), else the main box. */
function boxOf(fit: 'main' | 'alt' | 'none', box: PlatformCoverBox): { width: number; height: number } {
  return fit === 'alt' && box.altWidth && box.altHeight ? { width: box.altWidth, height: box.altHeight } : box
}

/** True when cover `a` is strictly better than cover `b` for the platform's box. */
export function isBetterCover(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

/**
 * True when the cover a game has now is as good as the new candidate, so a pass keeps it.
 * A cover whose size is not measured yet cannot be compared, so the candidate wins.
 */
export function keepsCurrentCover(
  current: { width: number | null; height: number | null },
  candidate: { width: number | null | undefined; height: number | null | undefined },
  box: PlatformCoverBox,
): boolean {
  if (current.width == null || current.height == null) return false
  if (candidate.width == null || candidate.height == null) return false
  return !isBetterCover(
    coverKey(candidate.width, candidate.height, box),
    coverKey(current.width, current.height, box),
  )
}

/** The best cover among the sources of the chain, or null when no source gives one. */
export async function chooseCover(input: CoverChoiceInput): Promise<CoverCandidate | null> {
  const probe = input.probe ?? probeCoverImage
  const box = input.box ?? DEFAULT_BOX
  let best: { candidate: CoverCandidate; key: number[] } | null = null

  for (const source of input.chain) {
    const urlOf = input.urls[source]
    if (!urlOf) continue
    const url = await urlOf()
    if (!url) continue
    const image = await probe(url)
    if (!image) continue
    const key = coverKey(image.width, image.height, box)
    const candidate: CoverCandidate = {
      coverUrl: url,
      source,
      buffer: image.buffer,
      width: image.width,
      height: image.height,
      scale: coverScale(image.width, image.height, boxOf(coverFit(image.width, image.height, box), box)),
    }
    // A main box big enough is the best there is: a later source cannot beat it.
    if (key[0] === 1 && key[1] === 1 && key[2] === 1) return candidate
    if (!best || isBetterCover(key, best.key)) best = { candidate, key }
  }
  return best?.candidate ?? null
}
