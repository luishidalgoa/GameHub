import fs from 'fs'
import path from 'path'
import { extractSwitchTitleId, classifySwitchTitleId } from './titleid'

export interface FileEntry {
  filePath:  string
  fileName:  string
  fileSize:  bigint
  extension: string
  parentDir: string
  type?: 'game' | 'update' | 'dlc' | 'mod'
  /** Flat mode only: the game folder this file sits under, relative to the scan
   *  root ("Pokemon Y" for "Pokemon Y/Updates/foo.cia"). Lets an add-on find its
   *  base game when neither file carries a Title ID. */
  groupDir?: string
}

// ── Generic recursive walker ──────────────────────────────────────────────────

export function* walkDirectory(
  dir: string,
  extensions: string[],   // empty array = accept ALL extensions
  maxDepth = 5,
  currentDepth = 0,
): Generator<FileEntry> {
  if (currentDepth > maxDepth) return
  if (!fs.existsSync(dir)) return

  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

  const anyExt = extensions.length === 0

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      yield* walkDirectory(fullPath, extensions, maxDepth, currentDepth + 1)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (anyExt || extensions.includes(ext)) {
        let size = BigInt(0)
        try { size = BigInt(fs.statSync(fullPath).size) } catch { /* ignore */ }
        yield { filePath: fullPath, fileName: entry.name, fileSize: size, extension: ext, parentDir: dir }
      }
    }
  }
}

// ── Switch folder scanner ─────────────────────────────────────────────────────

export interface SwitchGameFolder {
  folderPath: string
  folderName: string
  /** The base game: the file whose Title ID says so, or the largest one when no
   *  file carries an ID. `null` when the folder holds only updates/DLC. */
  baseFile: FileEntry | null
  /** Updates and DLC files */
  dlcFiles: FileEntry[]
}

export function scanSwitchFolders(
  rootDir: string,
  extensions: string[],
  dlcPattern: RegExp,
): SwitchGameFolder[] {
  if (!fs.existsSync(rootDir)) return []

  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(rootDir, { withFileTypes: true }) } catch { return [] }

  const result: SwitchGameFolder[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue

    const folderPath = path.join(rootDir, entry.name)
    const rootFiles: FileEntry[] = []
    const dlcFiles: FileEntry[] = []

    let subEntries: fs.Dirent[]
    try { subEntries = fs.readdirSync(folderPath, { withFileTypes: true }) } catch { continue }

    for (const sub of subEntries) {
      const subPath = path.join(folderPath, sub.name)

      if (sub.isDirectory()) {
        const subNameLower = sub.name.toLowerCase()
        const isUpdateFolder = subNameLower === 'update' || subNameLower === 'updates'
        const isModFolder    = subNameLower === 'mod'    || subNameLower === 'mods'
        const isDlcFolder    = subNameLower === 'dlc'    || subNameLower === 'dlcs' || dlcPattern.test(sub.name)

        if (isUpdateFolder || isModFolder || isDlcFolder) {
          const fileType = isUpdateFolder ? 'update' : isModFolder ? 'mod' : 'dlc'
          // Mod folders accept any file extension (zips, archives, etc.)
          const walkExt = isModFolder ? [] : extensions
          for (const f of walkDirectory(subPath, walkExt, 2)) {
            dlcFiles.push({ ...f, type: fileType })
          }
        }
      } else if (sub.isFile()) {
        const ext = path.extname(sub.name).toLowerCase()
        if (extensions.includes(ext)) {
          let size = BigInt(0)
          try { size = BigInt(fs.statSync(subPath).size) } catch { /* ignore */ }
          rootFiles.push({ filePath: subPath, fileName: sub.name, fileSize: size, extension: ext, parentDir: folderPath })
        }
      }
    }

    if (rootFiles.length === 0 && dlcFiles.length === 0) continue

    rootFiles.sort((a, b) => (a.fileSize > b.fileSize ? -1 : a.fileSize < b.fileSize ? 1 : 0))

    // Biggest-file-wins is only a tie-breaker, not the rule. When a folder holds
    // ONLY an update — you have the patch for a game you never dumped — the old
    // rule promoted that patch to "the game", and it then got announced in the
    // shop index as an installable title. It is not: an update without its base
    // does not boot. The Title ID says so plainly (…800 = update), so ask it
    // first and fall back to size only when no file carries an ID at all.
    const classified = rootFiles.map((f) => {
      const tid = extractSwitchTitleId(f.fileName)
      return { file: f, kind: tid ? classifySwitchTitleId(tid) : null }
    })
    const anyTagged = classified.some((c) => c.kind !== null)
    const baseEntry = classified.find((c) => c.kind === 'base')
                   ?? (anyTagged ? undefined : classified[0])

    const baseFile = baseEntry?.file ?? null
    const updates  = classified
      .filter((c) => c !== baseEntry)
      .map((c) => ({ ...c.file, type: c.kind === 'dlc' ? ('dlc' as const) : ('update' as const) }))

    result.push({ folderPath, folderName: entry.name, baseFile, dlcFiles: [...updates, ...dlcFiles] })
  }

  return result
}

// ── Flat + DLC scanner (3DS / NDS Title ID pattern) ──────────────────────────
//
// 3DS Title ID layout: TTTTTTTTXXXXXXXX  (16 hex chars)
//   00040000XXXXXXXX → base game
//   0004000EXXXXXXXX → update  (XXXXXXXX matches base)
//   0004008CXXXXXXXX → DLC     (XXXXXXXX matches base)
//
// The last 8 hex chars are the game-unique key shared by base, update and DLC.

const TITLE_UPDATE_RE = /0004000e/i
const TITLE_DLC_RE    = /0004008c/i

export function classifyByTitleId(fileName: string): 'game' | 'update' | 'dlc' {
  if (TITLE_UPDATE_RE.test(fileName)) return 'update'
  if (TITLE_DLC_RE.test(fileName))    return 'dlc'
  return 'game'
}

// A Title ID in the file name is the *reliable* signal, but it is not always
// there: the name comes from wherever the file was downloaded, and a release
// group that omits it — or writes the BASE id on an update, which happens a
// lot — silently turned the add-on into a separate game. Folder layout is the
// other signal the user actually controls, and Switch (`folder` mode) has always
// honoured it. These make `flat` mode read it too.
const UPDATE_DIR_RE = /^(updates?|patch(es)?)$/i
const DLC_DIR_RE    = /^(dlcs?|add-?ons?)$/i

/**
 * Classify a file from the folders it sits under, relative to the scan root.
 * Returns `null` when no folder says anything, so the caller can fall back to
 * the Title ID. The folder wins when both speak: it is the explicit, manual
 * statement of intent, whereas the file name is whatever the download gave.
 */
export function classifyByFolder(relDirs: string[]): 'update' | 'dlc' | null {
  for (const d of relDirs) {
    if (UPDATE_DIR_RE.test(d)) return 'update'
    if (DLC_DIR_RE.test(d))    return 'dlc'
  }
  return null
}

/** Returns the 8-char game-unique portion of a 3DS Title ID found in `fileName`. */
export function extractGameKey(fileName: string): string | null {
  const m = fileName.match(/0004[0-9a-f]{12}/i)
  return m ? m[0].slice(-8).toUpperCase() : null
}

export interface FlatDlcScanResult {
  games:   FileEntry[]
  updates: FileEntry[]
  dlcs:    FileEntry[]
}

/**
 * Walks a directory tree and categorises each file as game / update / DLC.
 *
 * Two independent signals, checked in this order:
 *   1. An `Update(s)/`, `Patch/`, `DLC/` or `Add-on/` folder anywhere below the
 *      scan root — explicit and put there by hand, so it wins.
 *   2. The 3DS Title ID in the file name (`0004000E…` update, `0004008C…` DLC).
 *
 * Everything else is a game. Each entry also carries `groupDir`: the game folder
 * it lives under, which lets pass 2 attach an add-on to its base when neither
 * file has a Title ID to match on.
 */
export function walkFlatWithDlcDetection(
  dir:        string,
  extensions: string[],
): FlatDlcScanResult {
  const games:   FileEntry[] = []
  const updates: FileEntry[] = []
  const dlcs:    FileEntry[] = []

  for (const file of walkDirectory(dir, extensions)) {
    // Path segments between the scan root and the file, e.g. ["Pokemon Y", "Updates"].
    const rel     = path.relative(dir, file.parentDir)
    const relDirs = rel && rel !== '.' ? rel.split(path.sep).filter(Boolean) : []

    // The game folder is the first segment — but only when the file is nested
    // deeper than that folder itself, i.e. it sits in an Update/DLC subfolder.
    // A file directly inside "Pokemon Y/" is that game's base, not its own group.
    const groupDir = relDirs.length > 0 ? relDirs[0] : undefined

    const kind = classifyByFolder(relDirs) ?? classifyByTitleId(file.fileName)
    const entry = { ...file, groupDir }

    if      (kind === 'update') updates.push({ ...entry, type: 'update' })
    else if (kind === 'dlc')    dlcs.push(   { ...entry, type: 'dlc'    })
    else                        games.push(  { ...entry, type: 'game'   })
  }

  return { games, updates, dlcs }
}

// ── PSVita Ports scanner ──────────────────────────────────────────────────────
//
// Structure supported:
//
//   F:\Ports\
//   │   Sonic mania plus.zip            ← loose file → 1 game
//   ├── bully\
//   │   │   Bully_1.0.vpk               ← .vpk in folder root → base file
//   │   └── bully\                      ← same name as parent → data dir, SKIP
//   ├── Layton curious\
//   │       layton.vpk                  ← only vpk → base file
//   │       data.zip
//   └── Port Super Mario 64...\
//       ├── Versiones 30 FPS\VPK\*.vpk  ← different name → recurse, all = variants
//       └── Versiones 60 FPS\VPK\*.vpk

export interface PortsResult {
  loose:   FileEntry[]         // root-level files (each = 1 game)
  folders: SwitchGameFolder[]  // root-level folders (each = 1 game)
}

export function scanPortsFolders(rootDir: string, extensions: string[]): PortsResult {
  const loose:   FileEntry[]        = []
  const folders: SwitchGameFolder[] = []

  if (!fs.existsSync(rootDir)) return { loose, folders }

  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(rootDir, { withFileTypes: true }) } catch { return { loose, folders } }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = path.join(rootDir, entry.name)

    if (entry.isFile()) {
      // Loose file at root level → 1 game
      const ext = path.extname(entry.name).toLowerCase()
      if (extensions.includes(ext)) {
        let size = BigInt(0)
        try { size = BigInt(fs.statSync(fullPath).size) } catch { /* ignore */ }
        loose.push({ filePath: fullPath, fileName: entry.name, fileSize: size, extension: ext, parentDir: rootDir })
      }

    } else if (entry.isDirectory()) {
      // Root-level folder → 1 game (title = folder name)
      const gameFiles: FileEntry[] = []
      collectPortFiles(fullPath, entry.name.toLowerCase(), extensions, gameFiles, 0)

      if (gameFiles.length === 0) continue

      // Largest file = most likely base game; rest = variants (stored as DLC)
      gameFiles.sort((a, b) => (a.fileSize > b.fileSize ? -1 : 1))
      const baseFile  = gameFiles[0]
      const dlcFiles  = gameFiles.slice(1).map((f) => ({ ...f, type: 'dlc' as const }))

      folders.push({ folderPath: fullPath, folderName: entry.name, baseFile, dlcFiles })
    }
  }

  return { loose, folders }
}

/**
 * Recursively collects game files from a port folder.
 *
 * Skips subfolders whose lowercase name exactly matches `parentNameLc`
 * — this is the "data directory" pattern (e.g. bully/bully/).
 * All other subfolders are recursed into (up to maxDepth).
 */
function collectPortFiles(
  dir:          string,
  parentNameLc: string,
  extensions:   string[],
  result:       FileEntry[],
  depth:        number,
  maxDepth = 4,
) {
  if (depth > maxDepth) return

  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = path.join(dir, entry.name)

    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (extensions.includes(ext)) {
        let size = BigInt(0)
        try { size = BigInt(fs.statSync(fullPath).size) } catch { /* ignore */ }
        result.push({ filePath: fullPath, fileName: entry.name, fileSize: size, extension: ext, parentDir: dir })
      }

    } else if (entry.isDirectory()) {
      // Skip the data subfolder pattern: subfolder name == parent game folder name
      if (entry.name.toLowerCase() === parentNameLc) continue
      // Recurse — but pass the subfolder's own name as the new parentNameLc
      // so deeper nesting only skips self-named dirs at their own level
      collectPortFiles(fullPath, entry.name.toLowerCase(), extensions, result, depth + 1, maxDepth)
    }
  }
}
