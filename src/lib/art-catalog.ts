/**
 * Every image category LaunchBox publishes, under the name the data model uses for it.
 * The `kind` is what GameImage stores; the `group` is the tab of the game editor; the
 * `slot` is the game field the image can fill (banner, background or logo), if any.
 * An unknown LaunchBox category is still stored, as `other:<name>`, and listed under "other".
 */
export type ArtGroup = 'cover' | 'box' | 'media' | 'banner' | 'fanart' | 'logo' | 'screenshot' | 'other'
export type ArtSlot = 'banner' | 'fanart' | 'logo'

export interface ArtKind {
  kind: string
  /** The category name in the data model (and as LaunchBox names it). */
  title: string
  group: ArtGroup
  slot?: ArtSlot
}

export const ART_KINDS: ArtKind[] = [
  { kind: 'box-front', title: 'Box - Front', group: 'cover' },
  { kind: 'box-front-reconstructed', title: 'Box - Front - Reconstructed', group: 'cover' },
  { kind: 'box-back', title: 'Box - Back', group: 'box' },
  { kind: 'box-back-reconstructed', title: 'Box - Back - Reconstructed', group: 'box' },
  { kind: 'box-3d', title: 'Box - 3D', group: 'box' },
  { kind: 'box-spine', title: 'Box - Spine', group: 'box' },
  { kind: 'fanart-box-front', title: 'Fanart - Box - Front', group: 'box' },
  { kind: 'fanart-box-back', title: 'Fanart - Box - Back', group: 'box' },
  { kind: 'cart-front', title: 'Cart - Front', group: 'media' },
  { kind: 'cart-back', title: 'Cart - Back', group: 'media' },
  { kind: 'fanart-cart-front', title: 'Fanart - Cart - Front', group: 'media' },
  { kind: 'disc', title: 'Disc', group: 'media' },
  { kind: 'fanart-disc', title: 'Fanart - Disc', group: 'media' },
  { kind: 'banner', title: 'Banner', group: 'banner', slot: 'banner' },
  { kind: 'square', title: 'Square', group: 'other' },
  { kind: 'fanart', title: 'Fanart - Background', group: 'fanart', slot: 'fanart' },
  { kind: 'clear-logo', title: 'Clear Logo', group: 'logo', slot: 'logo' },
  { kind: 'screenshot-gameplay', title: 'Screenshot - Gameplay', group: 'screenshot' },
  { kind: 'screenshot-game-title', title: 'Screenshot - Game Title', group: 'screenshot' },
  { kind: 'screenshot-game-select', title: 'Screenshot - Game Select', group: 'screenshot' },
  { kind: 'advertisement-flyer-front', title: 'Advertisement Flyer - Front', group: 'other' },
  { kind: 'advertisement-flyer-back', title: 'Advertisement Flyer - Back', group: 'other' },
  { kind: 'arcade-marquee', title: 'Arcade Marquee', group: 'other' },
  { kind: 'arcade-cabinet', title: 'Arcade Cabinet', group: 'other' },
  { kind: 'manual', title: 'Manual', group: 'other' },
  { kind: 'map', title: 'Map', group: 'other' },
  { kind: 'icon', title: 'Icon', group: 'other' },
]

const BY_KIND = new Map(ART_KINDS.map(k => [k.kind, k]))

/**
 * When the art job started storing every LaunchBox category (commit 969e9d5). A game checked
 * before this instant has only the categories the old job stored, so "missing categories" revisits it.
 */
export const CATALOGUE_SINCE = '2026-10-22T22:54:36Z'

/** LaunchBox spells a few categories differently from the stored kind. */
const ALIASES: Record<string, string> = { 'fanart-background': 'fanart' }

/** The stored kind for a LaunchBox category name, or `other:<slug>` when it is not in the catalogue. */
export function kindFromLaunchBox(type: string): string {
  const slug = type.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const known = ALIASES[slug] ?? slug
  if (BY_KIND.has(known)) return known
  return `other:${slug || 'unknown'}`
}

/** The catalogue entry of a stored kind (manual and legacy `other:` kinds included), or null. */
export function artKindOf(stored: string): ArtKind | null {
  const base = stored.replace(/^manual-/, '').replace(/^other:/, '')
  return BY_KIND.get(base) ?? BY_KIND.get(ALIASES[base] ?? base) ?? null
}

/** The name a category shows under: the data model's title, or the LaunchBox name for an unknown one. */
export function artTitle(stored: string): string {
  const entry = artKindOf(stored)
  if (entry) return entry.title
  const base = stored.replace(/^manual-/, '').replace(/^other:/, '')
  return base.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** The tabs of the game editor's images: each group of the catalogue, plus the owner's cover. */
export type ArtCategory = ArtGroup

const MANUAL_GROUP: Record<string, ArtGroup> = {
  banner: 'banner', fanart: 'fanart', logo: 'logo', screenshot: 'screenshot', cover: 'cover',
}

/** The tab an image of this stored kind belongs to. */
export function categoryOf(kind: string): ArtCategory {
  if (isManualKind(kind)) return MANUAL_GROUP[kind.replace(/^manual-/, '')] ?? 'other'
  return artKindOf(kind)?.group ?? 'other'
}

/** The game art slot an image of this kind fills: the banner, the background or the logo. */
export function slotOf(kind: string): ArtSlot | null {
  const base = kind.replace(/^manual-/, '')
  if (base === 'banner' || base === 'fanart' || base === 'logo') return base
  if (base === 'clear-logo') return 'logo'
  return null
}

/** True for the images the owner brought in: only those can be removed. */
export function isManualKind(kind: string): boolean {
  return kind.startsWith('manual-')
}
