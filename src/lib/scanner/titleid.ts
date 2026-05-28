/**
 * Nintendo Switch Title ID helpers — used to group a game's base / update / DLC
 * files into a single logical title, even when split across multiple scan
 * directories (e.g. base game on one disk, update + DLC on another).
 *
 * Switch Title ID layout (64-bit, 16 hex chars):
 *   Base application : ...000   (low 12 bits == 0x000)
 *   Update / patch   : ...800   (base | 0x800)
 *   Add-on (DLC)     : ...yyy   (base region + 0x1000 + index)
 *
 * The "base application ID" is shared by a title and all of its updates/DLC, so
 * it makes an ideal grouping key.
 */

import { cleanTitle } from '@/lib/utils'

export type SwitchKind = 'base' | 'update' | 'dlc'

/** Extract a 16-hex Nintendo Title ID from a file name, if present. */
export function extractSwitchTitleId(fileName: string): string | null {
  // Prefer the bracketed form: "Game [0100ABC000XXX000].nsp"
  const bracketed = fileName.match(/\[([0-9a-fA-F]{16})\]/)
  if (bracketed) return bracketed[1].toUpperCase()

  // Fallback: a bare 16-hex token that looks like a retail/homebrew Title ID
  // (Switch app IDs start with 01.. or 05..). Guard with non-hex boundaries so
  // we don't slice a longer hash.
  const bare = fileName.match(/(?:^|[^0-9a-fA-F])((?:01|05)[0-9a-fA-F]{14})(?:[^0-9a-fA-F]|$)/)
  return bare ? bare[1].toUpperCase() : null
}

// BigInt literals (0x800n) require an ES2020 target; this project targets
// lower, so use the BigInt() constructor like the rest of the codebase.
const B_FFF  = BigInt(0xfff)
const B_800  = BigInt(0x800)
const B_1000 = BigInt(0x1000)
const B_0    = BigInt(0)

/** Classify a Title ID as base / update / DLC. */
export function classifySwitchTitleId(titleId: string): SwitchKind {
  const id  = BigInt('0x' + titleId)
  const low = id & B_FFF
  if (low === B_0)   return 'base'
  if (low === B_800) return 'update'
  return 'dlc'
}

/** Derive the base application ID (16-hex, upper-case) from any Title ID. */
export function baseApplicationId(titleId: string): string {
  const id  = BigInt('0x' + titleId)
  const low = id & B_FFF

  let base: bigint
  if (low === B_800) {
    // update → clear the 0x800 patch bit
    base = id & ~B_800
  } else if (low !== B_0) {
    // DLC → drop index nibble and step back one title-id slot
    base = (id & ~B_FFF) - B_1000
  } else {
    base = id
  }

  return base.toString(16).toUpperCase().padStart(16, '0')
}

/**
 * Compute a stable group key from a set of file names.
 *  - If any Switch Title ID is found  → "tid:<baseApplicationId>"
 *  - Otherwise (no Title IDs)         → null (caller falls back to folder name)
 */
export function switchGroupKey(fileNames: string[]): string | null {
  for (const name of fileNames) {
    const tid = extractSwitchTitleId(name)
    if (tid) return `tid:${baseApplicationId(tid)}`
  }
  return null
}

/** Normalize a folder/file name into a name-based group key. */
export function nameGroupKey(folderOrFileName: string): string {
  const norm = cleanTitle(folderOrFileName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  return `name:${norm}`
}
