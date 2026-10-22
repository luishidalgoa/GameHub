export type RGB = [number, number, number]

/** "#rrggbb" to 0-1 channels; null for anything else. */
export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Keep a color bright and saturated enough to tint a dark page: raw palette
 *  colors from a dark game art would otherwise vanish into the background. */
export function lift(rgb: RGB): RGB {
  const max = Math.max(...rgb)
  const k = max < 0.55 ? 0.55 / Math.max(max, 0.05) : 1
  return [Math.min(1, rgb[0] * k), Math.min(1, rgb[1] * k), Math.min(1, rgb[2] * k)]
}

export const toHex = (c: RGB) => '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
