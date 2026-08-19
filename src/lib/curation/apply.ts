/**
 * The half of curation that writes to disk.
 *
 * The web app can only ever *propose* renames: it mounts the library read-only
 * because its shop is reachable from the public internet and there is 1.3 TB of
 * irreplaceable media behind it. So the app drops an approved plan into
 * `<data>/curation/` and this module — running in a separate, networkless
 * process — is the only thing that touches the filesystem.
 *
 * Two rules follow from that split, and both matter more than they look:
 *
 *  1. A plan is UNTRUSTED INPUT. It was written by a process that could, in the
 *     worst case, be under someone else's control. Everything the app validated
 *     is validated again here against the database and the disk as they are NOW,
 *     not as they were when the plan was approved.
 *
 *  2. Validation reuses `validateProposedName` from the planner rather than
 *     reimplementing it. The previous host-side applier had its own copy of the
 *     rules; two implementations of the same rule drift apart silently, and the
 *     one guarding the filesystem is the wrong one to let drift.
 */

import { rename, stat, mkdir, writeFile } from 'fs/promises'
import path from 'path'

import { db } from '@/lib/db'
import { validateProposedName } from '@/lib/curation'

/** One approved rename, exactly as the plan API writes it. */
export interface PlanEntry {
  id: number
  fromPath: string
  fromName: string
  toName: string
  toPath: string
}

export interface ApplyResult {
  renamed: number
  failed: number
  skipped: number
  /** Where the undo map was written, when anything was actually renamed. */
  undoMap?: string
}

/**
 * The library lives under /mnt and nowhere else. A plan pointing outside it is
 * at best a bug, so it is never executed.
 */
const ROOTS = ['/mnt/'] as const

/** Commit the database every this many renames, so a crash loses little. */
const BATCH = 25

const CONTROL_CHARS = /[\x00-\x1f\x7f]/

function extensionOf(name: string): string {
  const m = /\.[^./\\]+$/.exec(name)
  return m ? m[0].toLowerCase() : ''
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile()
  } catch {
    return false
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/**
 * Returns a reason to reject the entry, or null if it is safe to apply.
 *
 * `row` is what the database says right now — the library may have been
 * rescanned, or the game edited, since the plan was approved.
 */
export async function revalidate(
  entry: PlanEntry,
  row: { filePath: string } | null,
): Promise<string | null> {
  if (!row) return 'the game no longer exists in the database'
  if (row.filePath !== entry.fromPath) {
    return 'the database no longer points at that file (rescanned?)'
  }

  const dest = entry.toPath
  const name = path.basename(dest)

  const inLibrary = (p: string) => ROOTS.some(r => p.startsWith(r))
  if (!inLibrary(entry.fromPath) || !inLibrary(dest)) return 'outside the library'
  if (path.normalize(dest) !== dest || dest.split(path.sep).includes('..')) {
    return 'path is not normalised'
  }
  // Renaming is allowed; moving is not. Keeping a file in its folder means a
  // bad plan can never relocate media across platforms or off the volume.
  if (path.dirname(dest) !== path.dirname(entry.fromPath)) return 'changes folder'
  if (!name || name === '.' || name === '..') return 'empty name'
  if (name.length > 255) return 'name too long'
  if (CONTROL_CHARS.test(name)) return 'control characters'
  // Changing the extension would break the emulator that opens it.
  if (extensionOf(name) !== extensionOf(entry.fromName)) return 'changes the extension'

  // The planner's own rule, not a second copy of it.
  const bad = validateProposedName(entry.fromName, entry.toName)
  if (bad) return bad

  if (!(await isFile(entry.fromPath))) return 'source file does not exist'
  if (await exists(dest)) return 'destination already exists'
  return null
}

/** Where undo maps are kept: inside the data volume, so backups pick them up. */
export function undoDir(dataRoot: string): string {
  return path.join(dataRoot, 'curation', 'undo')
}

/**
 * Apply one plan. With `dryRun`, nothing is renamed and nothing is written.
 */
export async function applyPlan(
  entries: PlanEntry[],
  opts: { dataRoot: string; dryRun?: boolean; log?: (msg: string) => void },
): Promise<ApplyResult> {
  const log = opts.log ?? (() => {})
  const accepted: PlanEntry[] = []
  let skipped = 0

  for (const entry of entries) {
    const row = await db.game.findUnique({
      where: { id: entry.id },
      select: { filePath: true },
    })
    const reason = await revalidate(entry, row)
    if (reason) {
      skipped++
      log(`  - skipped id=${entry.id}: ${reason}`)
    } else {
      accepted.push(entry)
    }
  }

  if (opts.dryRun) {
    for (const e of accepted.slice(0, 8)) log(`  ${e.fromName}\n     → ${e.toName}`)
    log(`  DRY RUN: ${accepted.length} would be renamed, ${skipped} skipped`)
    return { renamed: 0, failed: 0, skipped }
  }

  if (accepted.length === 0) {
    log('  nothing to do')
    return { renamed: 0, failed: 0, skipped }
  }

  // The undo map is written BEFORE a single file moves. If this process dies
  // halfway, the map still describes every rename that could have happened.
  const dir = undoDir(opts.dataRoot)
  await mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const undoMap = path.join(dir, `undo-${stamp}.json`)
  await writeFile(undoMap, JSON.stringify(accepted, null, 1), 'utf8')
  log(`  undo map: ${undoMap}`)

  let renamed = 0
  let failed = 0
  for (const entry of accepted) {
    try {
      // The rename and the row go together: filePath is GameHub's unique key,
      // and leaving them out of step would create duplicates on the next scan.
      await rename(entry.fromPath, entry.toPath)
      await db.game.update({
        where: { id: entry.id },
        data: { filePath: entry.toPath, fileName: entry.toName },
      })
      renamed++
    } catch (err) {
      failed++
      log(`  ! id=${entry.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  log(`  renamed: ${renamed}   failed: ${failed}   skipped: ${skipped}`)
  return { renamed, failed, skipped, undoMap }
}

/** Undo a previously applied plan, using the map written by `applyPlan`. */
export async function revertPlan(
  entries: PlanEntry[],
  log: (msg: string) => void = () => {},
): Promise<{ reverted: number; failed: number }> {
  let reverted = 0
  let failed = 0
  for (const entry of entries) {
    try {
      // Only move the file back if it is still where we left it and the old
      // name is free — otherwise just repair the database row.
      if ((await exists(entry.toPath)) && !(await exists(entry.fromPath))) {
        await rename(entry.toPath, entry.fromPath)
      }
      await db.game.update({
        where: { id: entry.id },
        data: { filePath: entry.fromPath, fileName: entry.fromName },
      })
      reverted++
    } catch (err) {
      failed++
      log(`  ! id=${entry.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  log(`reverted: ${reverted}   failed: ${failed}`)
  return { reverted, failed }
}

export const __testing = { extensionOf, BATCH }
