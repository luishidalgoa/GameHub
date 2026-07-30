/**
 * Labels recovered from an add-on's file name — the patch version and the DLC's
 * own name.
 *
 * Neither is stored: `GameDlc` has no `version` column, and the scanner puts the
 * *game* name in `title` after stripping the bracketed metadata. So both lists
 * render rows that are impossible to tell apart — two patches of one game show
 * as the same line, and every DLC of a game shows the game's name instead of the
 * DLC's. Of 415 DLC rows in a real library, 265 have `title` set to exactly the
 * parent game's title.
 *
 * The file name still carries everything, in bracketed segments:
 *
 *   Just Dance 2023 [0100BEE017FC0800][v393216].nsp
 *   Animal Crossing New Horizons [Nook Inc Silk Rug] [01006F800232712D][v0].nsp
 *
 * Reading it back from there fixes the display with no migration and no rescan.
 * Anything unrecognised returns null and the caller falls back to what it showed
 * before.
 */

/** 0x10000 — the step between consecutive Switch patch versions. */
const VERSION_STEP = 65536

/** A bracketed 16-hex Nintendo Title ID: "[0100BEE017FC0800]". */
const TITLE_ID_SEGMENT = /^[0-9a-fA-F]{16}$/

/** A bracketed version, with or without the "v": "[v393216]", "[65536]". */
const VERSION_SEGMENT = /^v?\d{1,10}$/

/**
 * Bracketed tags that describe the dump rather than name the content. Compared
 * lower-case, and only as a whole segment — "[DLC Early Bird Bonus]" is a name
 * and must survive, while a bare "[DLC]" is noise.
 */
const NOISE_SEGMENTS = new Set(['upd', 'update', 'dlc', 'base', 'us', 'eu', 'jp', 'world'])

/**
 * Version tag for a patch file, e.g. `"v2162688"` or `"v1.2.0"`.
 * Returns null when the name carries no recognisable version.
 */
export function extractUpdateVersion(fileName: string): string | null {
  // Canonical form written by every dumping tool: "Game [0100…800][v2162688].nsp"
  const tagged = fileName.match(/\[v(\d{1,10})\]/i)
  if (tagged) return `v${tagged[1]}`

  // Same integer, brackets without the "v": "[010066401D88E800][65536][UPD]".
  // Only multiples of the step qualify, so a year or a disc number bracketed on
  // its own ("[2023]") can never be mistaken for a version.
  const brackets = /\[(\d{1,10})\]/g
  for (let m = brackets.exec(fileName); m !== null; m = brackets.exec(fileName)) {
    const n = Number(m[1])
    if (n > 0 && n % VERSION_STEP === 0) return `v${n}`
  }

  // Bare suffix, no brackets: "pokemon_legends_arceus_v1.1.1_v262144.nsp".
  // Same multiple-of-step guard, and at least five digits so the "v1" of a
  // marketing version never reaches here.
  const bare = fileName.match(/[_ .\-]v(\d{5,10})(?=[_ .\-[]|$)/i)
  if (bare) {
    const n = Number(bare[1])
    if (n % VERSION_STEP === 0) return `v${n}`
  }

  // Marketing version the release itself carries. Covers both the Switch style
  // ("Super Mario Bros Wonder v1.2.0") and the parenthesised 3DS/NDS convention
  // ("Monster Hunter 4 Ultimate (CTR-U-BFGP) (v1.1.0) (E).cia"), since the same
  // update list holds files for those platforms too. Last resort: less precise
  // than the integer, but better than showing nothing.
  const human = fileName.match(/(?:^|[ _.\-[(])v(\d+(?:\.\d+)+)/i)
  return human ? `v${human[1]}` : null
}

/**
 * The DLC's own name, e.g. `"Nook Inc Silk Rug"`, taken from the first bracketed
 * segment that names content rather than describing the dump.
 *
 * Returns null when the file name carries no such segment — a DLC identified
 * only by Title ID and version — and the caller keeps showing what it showed
 * before. On a 415-row library this resolves 408.
 */
export function extractDlcName(fileName: string): string | null {
  const segments = /\[([^\]]+)\]/g
  for (let m = segments.exec(fileName); m !== null; m = segments.exec(fileName)) {
    const segment = m[1].trim()
    if (!segment) continue
    if (TITLE_ID_SEGMENT.test(segment)) continue
    if (VERSION_SEGMENT.test(segment)) continue
    if (NOISE_SEGMENTS.has(segment.toLowerCase())) continue
    return segment
  }
  return null
}
