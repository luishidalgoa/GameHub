/**
 * Region-variant unification.
 *
 * Many libraries hold the SAME game several times, one ROM per region/language
 * (e.g. "Game (USA)" + "Game (Europe) (En,Es,Fr)"). We collapse those into ONE
 * card: a single canonical `Game` row (the *primary* edition) plus one
 * `GameDlc` row of `type = 'region'` per remaining ROM, so every regional file
 * stays independently downloadable through the existing DLC download pipeline.
 *
 * All grouping flows (live scan and the one-off migration) funnel through
 * {@link consolidateRegionGroup} so there is a SINGLE destructive code path.
 */

import { db } from '@/lib/db'
import { parseRomTags, languagesFromCsv } from '@/lib/rom-tags'

// ── Primary-edition preference (deterministic; tweak here) ────────────────────
//
// A variant whose languages include Spanish wins outright (matches a PAL/ES
// library); otherwise region order decides; then the larger file; then the
// lowest id for stability. Re-scanning therefore always anchors the same row.
const PREFER_LANGUAGE = 'es'
const REGION_PREFERENCE = ['ESP', 'EUR', 'USA', 'World', 'JPN']

export type GameRow = {
  id: number
  filePath: string
  fileName: string
  fileSize: bigint
  region: string | null
  languages: string | null
}

function regionRank(region: string | null): number {
  if (!region) return REGION_PREFERENCE.length + 1
  const i = REGION_PREFERENCE.indexOf(region)
  return i === -1 ? REGION_PREFERENCE.length : i
}

/** Languages for a row, falling back to a re-parse of the file name. */
function rowLanguages(g: GameRow): string[] {
  const stored = languagesFromCsv(g.languages)
  return stored.length ? stored : parseRomTags(g.fileName).languages
}

/** Pick the row that should be the primary edition of a group. */
export function choosePrimary<T extends GameRow>(rows: T[]): T {
  return [...rows].sort(byPreference)[0]
}

/** Order rows best-primary first. */
function byPreference(a: GameRow, b: GameRow): number {
  const aEs = rowLanguages(a).includes(PREFER_LANGUAGE) ? 0 : 1
  const bEs = rowLanguages(b).includes(PREFER_LANGUAGE) ? 0 : 1
  if (aEs !== bEs) return aEs - bEs

  const ar = regionRank(a.region)
  const br = regionRank(b.region)
  if (ar !== br) return ar - br

  if (a.fileSize !== b.fileSize) return a.fileSize > b.fileSize ? -1 : 1
  return a.id - b.id
}

export interface ConsolidationResult {
  /** id of the surviving canonical game (null when nothing to do). */
  primaryId: number | null
  /** how many sibling rows were folded in as region editions. */
  merged: number
}

/**
 * Collapse every `Game` sharing `(platformId, groupKey)` into one primary plus
 * `type='region'` editions. Idempotent: with 0/1 matching rows it is a no-op,
 * and re-running never duplicates editions (they upsert by filePath).
 */
export async function consolidateRegionGroup(
  platformId: number,
  groupKey: string,
): Promise<ConsolidationResult> {
  const games = await db.game.findMany({
    where: { platformId, groupKey },
    select: { id: true, filePath: true, fileName: true, fileSize: true, region: true, languages: true },
  })
  if (games.length < 2) return { primaryId: games[0]?.id ?? null, merged: 0 }

  const primary = choosePrimary(games)
  const rest = games.filter(g => g.id !== primary.id)

  let merged = 0
  for (const g of rest) {
    // 1) Re-parent any DLC/update/mod/region rows the sibling owned.
    await db.gameDlc.updateMany({ where: { gameId: g.id }, data: { gameId: primary.id } })

    // 2) Preserve the sibling's own ROM as a downloadable region edition,
    //    unless it's the very same file as the primary.
    if (g.fileSize > BigInt(0) && g.filePath !== primary.filePath) {
      await db.gameDlc.upsert({
        where:  { filePath: g.filePath },
        update: { gameId: primary.id, type: 'region', fileSize: g.fileSize, region: g.region, languages: g.languages },
        create: {
          gameId:    primary.id,
          filePath:  g.filePath,
          fileName:  g.fileName,
          fileSize:  g.fileSize,
          title:     g.region ?? g.fileName,
          type:      'region',
          region:    g.region,
          languages: g.languages,
        },
      }).catch(() => {/* a concurrent upsert on the same path is harmless */})
    }

    // 3) Drop the now-empty sibling Game row.
    await db.game.delete({ where: { id: g.id } }).catch(() => {})
    merged++
  }

  return { primaryId: primary.id, merged }
}

/**
 * Find every `(platformId, groupKey)` on a platform that still has more than one
 * `Game` row and consolidate each. Called by the scanner after a platform's
 * files have been walked, and by the migration script.
 */
export async function consolidatePlatform(platformId: number): Promise<{ groups: number; merged: number }> {
  const dupes = await db.game.groupBy({
    by: ['groupKey'],
    where: { platformId, groupKey: { not: null } },
    _count: { _all: true },
    having: { groupKey: { _count: { gt: 1 } } },
  })

  let groups = 0, merged = 0
  for (const d of dupes) {
    if (!d.groupKey) continue
    const res = await consolidateRegionGroup(platformId, d.groupKey)
    if (res.merged > 0) { groups++; merged += res.merged }
  }
  return { groups, merged }
}
