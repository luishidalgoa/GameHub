import type { LaunchBoxImage } from './launchbox'

export type BackdropKind = 'banner' | 'fanart' | 'square' | 'title' | 'snap'

export interface PickedArt {
  image: LaunchBoxImage
  kind: BackdropKind
}

// Backdrop categories in the owner's order of preference. The LaunchBox type
// strings are compared with spaces and dashes ignored ("Fanart - Background").
const BACKDROP_ORDER: { kind: BackdropKind; type: string }[] = [
  { kind: 'banner', type: 'banner' },
  { kind: 'fanart', type: 'fanartbackground' },
  { kind: 'square', type: 'square' },
  { kind: 'title', type: 'screenshotgametitle' },
]

// Regions in order of preference: a region-less (world) image is the most
// reusable, then the languages the site is read in, then the rest.
const REGION_ORDER = ['world', 'europe', 'spain', 'united states', 'north america', 'united kingdom']

const flat = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

function regionRank(region: string | undefined): number {
  if (!region) return 0
  const i = REGION_ORDER.indexOf(region.toLowerCase())
  return i === -1 ? REGION_ORDER.length + 1 : i + 1
}

/**
 * Minimum width/height ratio for a category to be used as a wide image. A banner
 * or fanart that is upright is not one: LaunchBox files some pages of text and
 * portrait box scans under "Banner". Unknown sizes are given the benefit of the doubt.
 */
const MIN_WIDE_RATIO: Record<string, number> = { banner: 2, fanartbackground: 1.2, screenshotgametitle: 1.1 }

function isWideEnough(image: LaunchBoxImage, type: string): boolean {
  const min = MIN_WIDE_RATIO[type]
  if (!min || !image.width || !image.height) return true
  return image.width / image.height >= min
}

/** Best image of one category: preferred region first, then the largest. */
function best(images: LaunchBoxImage[], type: string): LaunchBoxImage | null {
  const ofType = images.filter(i => flat(i.type) === type && isWideEnough(i, type))
  if (ofType.length === 0) return null
  return [...ofType].sort((a, b) =>
    regionRank(a.region) - regionRank(b.region) || (b.width ?? 0) - (a.width ?? 0),
  )[0]
}

/** The background image for a game page and its tiles, by category priority. */
export function pickBackdrop(images: LaunchBoxImage[]): PickedArt | null {
  for (const { kind, type } of BACKDROP_ORDER) {
    const image = best(images, type)
    if (image) return { image, kind }
  }
  return null
}

/** The 16:9 fanart used by the wide tiles, when the game has one. */
export function pickFanart(images: LaunchBoxImage[]): LaunchBoxImage | null {
  return best(images, 'fanartbackground')
}

/** The transparent title logo, when the game has one. */
export function pickLogo(images: LaunchBoxImage[]): LaunchBoxImage | null {
  return best(images, 'clearlogo')
}
