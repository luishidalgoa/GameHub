// Client-safe on purpose: no database or image code, so tiles can import it.
/**
 * The motif each publisher's tile is painted with, so the rail reads as a set of
 * brands and not as a set of gradients. Smoke for the dark and gritty ones, rays
 * for the bright, slashes for the violent, dots for the pop and stripes for the
 * retro.
 */
export type BackdropStyle = 'smoke' | 'rays' | 'contours' | 'halftone' | 'slash' | 'stripes' | 'burst' | 'grid'
export const BRAND_STYLE: Record<string, BackdropStyle> = {
  nintendo: 'burst', sony: 'smoke', sega: 'rays', capcom: 'slash', konami: 'smoke',
  activision: 'smoke', ubisoft: 'contours', ea: 'halftone', 'square enix': 'rays',
  thq: 'stripes', atari: 'halftone', disney: 'grid', majesco: 'halftone',
}
