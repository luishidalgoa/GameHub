/**
 * What a GameDlc row is, from the file that sits next to a base game (#78).
 *
 *   base    — never a stored extra: a base file is the game itself
 *   region  — another edition of the same game (a second base-looking ROM)
 *   update  — a patch for the game
 *   dlc     — an add-on
 *   mod     — a modification
 *
 * Every writer of GameDlc.type goes through extraType(), so the same file gets
 * the same type whichever path found it.
 */
export type RomKind = 'base' | 'update' | 'dlc' | 'mod'
export type ExtraType = 'region' | 'update' | 'dlc' | 'mod'

export function extraType(kind: RomKind): ExtraType {
  if (kind === 'base') return 'region'
  return kind
}
