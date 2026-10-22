/**
 * The art every game shows, in the owner's order:
 *   1. Banner            (LaunchBox, at least 960 px wide and wide-shaped)
 *   2. Fanart background (LaunchBox, same size rule)
 *   3. Square            (LaunchBox)
 *   4. Screenshot - Game Title (LaunchBox)
 *   5. Box art           (the game's cover; the home falls back here last)
 * Libretro snapshots (stored as "-tile.webp") are never used: they are low
 * resolution. Screenshots from RAWG are never used as art.
 *
 * `backdropPath` already holds the best of 1-4 (picked in order by
 * pickBackdrop), so it wins over `tilePath`, which holds the fanart.
 */
const LAUNCHBOX_KINDS = ['banner', 'fanart', 'square', 'title']

const isLibretro = (key: string | null) => !!key && key.includes('-tile.webp')

export function tileImageKey(
  tilePath: string | null,
  backdropPath: string | null,
  backdropKind: string | null,
): string | null {
  if (backdropPath && !isLibretro(backdropPath) && backdropKind && LAUNCHBOX_KINDS.includes(backdropKind)) {
    return backdropPath
  }
  if (tilePath && !isLibretro(tilePath)) return tilePath
  return null
}
