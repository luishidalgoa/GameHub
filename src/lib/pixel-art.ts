/**
 * Whole-number scale that brings a pixel-art screenshot to at least `target`
 * pixels wide. Retro snapshots are 160-320 px wide; the browser would smooth
 * them into mush on a wide tile, but an integer nearest-neighbor scale keeps
 * every pixel a crisp square. 1 when the image is already big enough.
 */
export function pixelScale(width: number, target = 1280): number {
  if (!Number.isFinite(width) || width <= 0) return 1
  return Math.max(1, Math.ceil(target / width))
}
