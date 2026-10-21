import sharp from 'sharp'

/** "#rrggbb" for an RGB triple. */
const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')

function toHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : d / max, max / 255]
}

/**
 * The most characteristic colors of an RGB image (3 bytes per pixel), as hex.
 *
 * Pixels are bucketed in 4 bits per channel and each bucket is weighted by its
 * population times its saturation and brightness, so a dark or gray background
 * does not crowd out the accent colors a page can actually be themed with. Picks
 * are kept at least `minHueGap` degrees apart so the palette is not three shades
 * of the same color.
 */
export function extractPalette(rgb: Uint8Array, count = 3, minHueGap = 28): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const e = buckets.get(key)
    if (e) { e.n++; e.r += r; e.g += g; e.b += b }
    else buckets.set(key, { n: 1, r, g, b })
  }
  const scored = [...buckets.values()].map(e => {
    const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n
    const [h, s, v] = toHsv(r, g, b)
    return { r, g, b, h, score: e.n * (0.15 + s) * (0.2 + v) * (v < 0.12 ? 0.1 : 1) }
  }).sort((a, b) => b.score - a.score)

  const picked: typeof scored = []
  for (const c of scored) {
    const apart = picked.every(p => {
      const d = Math.abs(p.h - c.h)
      return Math.min(d, 360 - d) >= minHueGap
    })
    if (apart) picked.push(c)
    if (picked.length === count) break
  }
  // A near-monochrome image may not have `count` distinct hues: top up with its
  // strongest remaining colors rather than returning a short palette.
  for (const c of scored) {
    if (picked.length >= count) break
    if (!picked.includes(c)) picked.push(c)
  }
  return picked.map(c => hex(c.r, c.g, c.b))
}

/** Palette of an encoded image, measured on a 64 px thumbnail. */
export async function paletteOf(image: Buffer, count = 3): Promise<string[]> {
  const { data } = await sharp(image)
    .resize(64, 64, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return extractPalette(data, count)
}
