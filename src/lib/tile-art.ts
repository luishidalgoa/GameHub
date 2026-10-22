/**
 * Which picture a home tile shows, in the owner's order: banner, fanart, square,
 * game-title screen, then the box art. The backdrop already holds the best of
 * the first four (LaunchBox, sized and filtered), so it is used when it is one
 * of those kinds. The libretro snapshots (low-resolution, stored as "-tile.webp")
 * are not used as tiles; the box art stands in for them.
 */
export function tileImageKey(
  tilePath: string | null,
  backdropPath: string | null,
  backdropKind: string | null,
): string | null {
  if (tilePath) return tilePath
  if (!backdropPath) return null
  const wide = backdropKind === 'banner' || backdropKind === 'fanart' || backdropKind === 'square'
  const titleScreen = backdropKind === 'title' && !backdropPath.includes('-tile.webp')
  return wide || titleScreen ? backdropPath : null
}
