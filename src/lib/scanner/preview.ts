import fs from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { canonicalGroupKey } from '@/lib/group-key'
import { gameGroupKey } from '@/lib/rom-tags'
import { walkDirectory, scanSwitchFolders, scanPortsFolders, walkFlatWithDlcDetection, isUnchanged } from './walker'
import type { FileEntry, SwitchGameFolder } from './walker'

type ScanMode = 'flat' | 'folder' | 'ports'

/**
 * The key the scanner files a group under. A renamed file keeps it: a Switch
 * folder keys on its Title IDs, and a loose file on its normalised name.
 * Mirrors processFolderGroups and the flat path in scanner/index.ts.
 */
export function groupKeyOf(group: FileEntry[], mode: ScanMode): string {
  const first = group[0]
  if (mode === 'flat' || (mode === 'ports' && group.length === 1)) return gameGroupKey(first.fileName)
  return canonicalGroupKey({
    folderName: path.basename(first.parentDir),
    fileNames: group.map((f) => f.fileName),
    switchMode: true,
  })
}

/**
 * What a scan would do to the library, counted without writing anything (#137).
 * It walks the same paths with the same walkers and applies the same "unchanged"
 * test as the scanner, so the numbers match what the next scan would report.
 */

export interface ScanPreviewPlatform {
  slug: string
  name: string
  mode: 'flat' | 'folder' | 'ports'
  /** False when a scan root is missing: its files are not counted as gone. */
  accessible: boolean
  files: { new: number; changed: number; unchanged: number }
  /** Rows whose file is no longer under a reachable root: the next scan hides them. */
  gone: number
  /** First few paths of each kind, so the owner can see what the numbers mean. */
  sample: { new: string[]; changed: string[]; gone: string[] }
}

export interface ScanPreview {
  platforms: ScanPreviewPlatform[]
  totals: { new: number; changed: number; unchanged: number; gone: number }
}

const SAMPLE = 10

type Known = { fileSize: bigint; fileMtime: Date | null }

/** The candidate files of one platform, grouped the way the scanner groups them. */
function collect(
  mode: 'flat' | 'folder' | 'ports',
  scanDlc: boolean,
  roots: string[],
  extensions: string[],
): { groups: FileEntry[][]; missingRoots: string[]; folderPaths: string[] } {
  const groups: FileEntry[][] = []
  const missingRoots: string[] = []
  // A game with no base file is stored under its folder, so the folder path is a key too.
  const folderPaths: string[] = []

  if (mode === 'folder' || mode === 'ports') {
    const folders: SwitchGameFolder[] = []
    const loose: FileEntry[] = []
    for (const root of roots) {
      if (!fs.existsSync(root)) { missingRoots.push(root); continue }
      if (mode === 'folder') folders.push(...scanSwitchFolders(root, extensions, /dlc|update|patch/i))
      else {
        const res = scanPortsFolders(root, extensions)
        loose.push(...res.loose)
        folders.push(...res.folders)
      }
    }
    for (const file of loose) groups.push([file])
    for (const folder of folders) {
      folderPaths.push(folder.folderPath)
      groups.push([folder.baseFile, ...folder.dlcFiles].filter((f): f is FileEntry => Boolean(f)))
    }
    return { groups, missingRoots, folderPaths }
  }

  for (const root of roots) {
    if (!fs.existsSync(root)) { missingRoots.push(root); continue }
    if (scanDlc) {
      const { games, updates, dlcs } = walkFlatWithDlcDetection(root, extensions)
      for (const f of [...games, ...updates, ...dlcs]) groups.push([f])
    } else {
      for (const file of walkDirectory(root, extensions)) groups.push([file])
    }
  }
  return { groups, missingRoots, folderPaths }
}

/** A file's status against the stored row for its path: new, changed or unchanged. */
function statusOf(known: Known | undefined, file: FileEntry): 'new' | 'changed' | 'unchanged' {
  if (!known) return 'new'
  return isUnchanged(known, file) ? 'unchanged' : 'changed'
}

export interface SummaryInput {
  groups: FileEntry[][]
  folderPaths: string[]
  /** Scan roots that exist; rows outside them are not counted as gone. */
  reachable: string[]
  /** Keyed by file path. `groupKey` lets a renamed file be recognised as the same game. */
  knownGames: Map<string, Known & { isHidden?: boolean; groupKey?: string | null }>
  knownDlcs: Map<string, Known>
  mode?: ScanMode
}

/**
 * Counts for one platform, from what is on disk and what the database holds.
 * Pure: it reads nothing, so it can be tested with plain values.
 *
 * A file whose path has no row is "new" only when no row of the same group key
 * has gone missing. The scanner hands such a row over to the renamed file, so the
 * preview shows it as "changed", not as one game disappearing and another appearing.
 */
export function summarize({ groups, folderPaths, reachable, knownGames, knownDlcs, mode = 'flat' }: SummaryInput) {
  const knownOf = (p: string) => knownGames.get(p) ?? knownDlcs.get(p)
  const files = { new: 0, changed: 0, unchanged: 0 }
  const sample = { new: [] as string[], changed: [] as string[], gone: [] as string[] }
  const seen = new Set<string>(folderPaths)

  // First pass: what is on disk, and which paths the scan reaches.
  const grouped = groups.map(group => {
    const items = group.map(f => {
      seen.add(f.filePath)
      return { f, s: statusOf(knownOf(f.filePath), f) }
    })
    const groupUnchanged = items.length > 0 && items.every(x => x.s === 'unchanged')
    return { group, items, groupUnchanged }
  })

  // Rows under a reachable root that no file of this scan matches.
  const underReachable = (p: string) => reachable.some(r => p === r || p.startsWith(r + path.sep))
  const goneRows: Array<{ filePath: string; groupKey: string | null }> = []
  for (const [filePath, g] of knownGames) {
    if (g.isHidden || seen.has(filePath) || !underReachable(filePath)) continue
    goneRows.push({ filePath, groupKey: g.groupKey ?? null })
  }
  const goneDlcPaths: string[] = []
  for (const filePath of knownDlcs.keys()) {
    if (seen.has(filePath) || !underReachable(filePath)) continue
    goneDlcPaths.push(filePath)
  }

  // Missing rows by group key: the candidates a renamed file can take over.
  const missingByKey = new Map<string, string[]>()
  for (const row of goneRows) {
    if (!row.groupKey) continue
    const list = missingByKey.get(row.groupKey) ?? []
    list.push(row.filePath)
    missingByKey.set(row.groupKey, list)
  }

  // Second pass: count, pairing renamed files with the rows they take over.
  const takenOver = new Set<string>()
  for (const { group, items, groupUnchanged } of grouped) {
    const key = groupKeyOf(group, mode)
    for (const { f, s } of items) {
      if (groupUnchanged || s === 'unchanged') { files.unchanged++; continue }
      let status: 'new' | 'changed' = s
      if (s === 'new') {
        const candidates = missingByKey.get(key)
        const old = candidates?.shift()
        if (old) { takenOver.add(old); status = 'changed' }
      }
      files[status]++
      if (sample[status].length < SAMPLE) sample[status].push(f.filePath)
    }
  }

  // Rows that stayed missing after the pairing are the ones really gone.
  const gone = goneRows.filter(r => !takenOver.has(r.filePath))
  let goneCount = gone.length + goneDlcPaths.length
  for (const r of gone) if (sample.gone.length < SAMPLE) sample.gone.push(r.filePath)
  for (const p of goneDlcPaths) if (sample.gone.length < SAMPLE) sample.gone.push(p)
  return { files, gone: goneCount, sample }
}

export async function previewScan(platformSlug?: string): Promise<ScanPreview> {
  const platforms = await db.platform.findMany({
    where: platformSlug ? { slug: platformSlug, enabled: true } : { enabled: true },
    orderBy: { sortOrder: 'asc' },
  })

  const out: ScanPreviewPlatform[] = []

  for (const platform of platforms) {
    const extensions = platform.extensions.split(',').map(e => e.trim()).filter(Boolean)
    const roots = platform.scanPath.split('|').map(p => p.trim()).filter(Boolean)
    const mode = (platform.scanMode ?? 'flat') as 'flat' | 'folder' | 'ports'

    const { groups, missingRoots, folderPaths } = collect(mode, platform.scanDlc, roots, extensions)
    const reachable = roots.filter(r => !missingRoots.includes(r))

    const knownGames = new Map((await db.game.findMany({
      where: { platformId: platform.id },
      select: { filePath: true, fileSize: true, fileMtime: true, isHidden: true, groupKey: true },
    })).map(g => [g.filePath, g]))
    const knownDlcs = new Map((await db.gameDlc.findMany({
      where: { game: { platformId: platform.id } },
      select: { filePath: true, fileSize: true, fileMtime: true },
    })).map(d => [d.filePath, d]))
    const { files, gone, sample } = summarize({ groups, folderPaths, reachable, knownGames, knownDlcs, mode })

    out.push({
      slug: platform.slug,
      name: platform.name,
      mode,
      accessible: missingRoots.length === 0,
      files,
      gone,
      sample,
    })
  }

  const totals = out.reduce(
    (t, p) => ({
      new: t.new + p.files.new,
      changed: t.changed + p.files.changed,
      unchanged: t.unchanged + p.files.unchanged,
      gone: t.gone + p.gone,
    }),
    { new: 0, changed: 0, unchanged: 0, gone: 0 },
  )

  return { platforms: out, totals }
}
