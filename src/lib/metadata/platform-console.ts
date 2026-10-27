// GameHub keeps Game Boy as one platform (`game-boy`), but each game still belongs
// to one console: gb, gbc or gba. The per-console providers (libretro, Metacritic)
// key on that console, so it has to be told apart per game.

export const GAME_BOY_SLUG = 'game-boy'

/**
 * The console slug that serves one game, or null when the game's own console
 * cannot be told apart. Game Boy games carry their console in the file extension
 * (local ROMs) or in the torrent identity ("key:gbc:…") and its source key
 * ("minerva-gba"); every other platform is its own console.
 */
export function consoleSlugFor(
  platformSlug: string,
  game: { filePath?: string | null; externalKey?: string | null },
): string | null {
  if (platformSlug !== GAME_BOY_SLUG) return platformSlug
  const ext = game.filePath?.match(/\.(gba|gbc|gb)$/i)
  if (ext) return ext[1].toLowerCase()
  const torrent = game.externalKey?.match(/^torrent:([^:]+):(.*)$/)
  if (torrent) {
    const identity = torrent[2].match(/^key:(gbc|gb):/)
    if (identity) return identity[1]
    const source = torrent[1].match(/-(gba|gbc|gb)$/)
    if (source) return source[1]
  }
  return null
}
