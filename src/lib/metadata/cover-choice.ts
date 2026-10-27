import { probeCoverImage, type CoverProbe } from '@/lib/cover-probe'
import { COVER_MIN_SCALE, type CoverSource } from './chains'

export { COVER_MIN_SCALE }

// The cover chain: the sources in the order the platform asks them. The first one whose
// cover is good enough for the platform's box wins. A cover that is too small for the box
// is not used while another source can still answer; if none can, the best of the small
// ones is kept, because a small cover is still a cover.

const DEFAULT_BOX = { width: 200, height: 300 }

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
  /** The platform's box size, in pixels. */
  box?: { width: number; height: number }
  /** Reads a candidate's size and bytes. Injected by the tests; the default downloads the image. */
  probe?: (url: string) => Promise<CoverProbe | null>
}

export function coverScale(width: number, height: number, box: { width: number; height: number }): number {
  const w = Math.max(1, box.width) * COVER_MIN_SCALE
  const h = Math.max(1, box.height) * COVER_MIN_SCALE
  return Math.min(width / w, height / h)
}

/** The cover to keep for a game, or null when no source gives one. */
export async function chooseCover(input: CoverChoiceInput): Promise<CoverCandidate | null> {
  const probe = input.probe ?? probeCoverImage
  const box = input.box ?? DEFAULT_BOX
  let best: CoverCandidate | null = null

  for (const source of input.chain) {
    const urlOf = input.urls[source]
    if (!urlOf) continue
    const url = await urlOf()
    if (!url) continue
    const image = await probe(url)
    if (!image) continue
    const candidate: CoverCandidate = {
      coverUrl: url,
      source,
      buffer: image.buffer,
      width: image.width,
      height: image.height,
      scale: coverScale(image.width, image.height, box),
    }
    if (candidate.scale >= 1) return candidate
    if (!best || candidate.scale > best.scale) best = candidate
  }
  return best
}
