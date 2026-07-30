/**
 * Update version extracted from a Switch patch file name.
 *
 * The version is not stored anywhere: `GameDlc` has no `version` column and the
 * scanner strips the bracketed metadata when it fills `title`, so a row for
 * "Just Dance 2023 [0100BEE017FC0800][v393216].nsp" and one for the same game at
 * [v65536] both render as plain "Just Dance 2023" — two identical lines with no
 * way to tell which patch is which. Reading it back out of the file name fixes
 * the display without a migration or a rescan.
 *
 * Nintendo's patch version is an integer that steps in units of 0x10000 (65536
 * = the first update, 131072 = the second…), and dumping tools write it into the
 * name in a handful of shapes. All of them are handled here; anything else
 * returns null and the caller just shows the title as before.
 */

/** 0x10000 — the step between consecutive Switch patch versions. */
const VERSION_STEP = 65536

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
