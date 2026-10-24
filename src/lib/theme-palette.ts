/** The banner dissolves toward its bottom edge, over the page gradient, so there is no seam. */
export const BANNER_FADE = 'linear-gradient(to bottom, #000 0%, #000 38%, transparent 100%)'

/** The palette stored on the game, or null when there is none. */
export function parsePalette(raw: string | null | undefined): string[] | null {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) return arr.length ? arr : null
  } catch { /* ignore malformed */ }
  return null
}
