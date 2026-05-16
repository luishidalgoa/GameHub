import fs from 'fs'
import path from 'path'

export interface FileEntry {
  filePath:  string
  fileName:  string
  fileSize:  bigint
  extension: string
  parentDir: string
  type?: 'game' | 'update' | 'dlc'
}

// ── Generic recursive walker ──────────────────────────────────────────────────

export function* walkDirectory(
  dir: string,
  extensions: string[],
  maxDepth = 5,
  currentDepth = 0,
): Generator<FileEntry> {
  if (currentDepth > maxDepth) return
  if (!fs.existsSync(dir)) return

  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      yield* walkDirectory(fullPath, extensions, maxDepth, currentDepth + 1)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (extensions.includes(ext)) {
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
  /** Largest file in the folder root = the base game */
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
        const isDlcFolder    = subNameLower === 'dlc'    || subNameLower === 'dlcs' || dlcPattern.test(sub.name)

        if (isUpdateFolder || isDlcFolder) {
          const fileType = isUpdateFolder ? 'update' : 'dlc'
          for (const f of walkDirectory(subPath, extensions, 2)) {
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
    const baseFile = rootFiles[0] ?? null
    const updates  = rootFiles.slice(1).map((f) => ({ ...f, type: 'update' as const }))

    result.push({ folderPath, folderName: entry.name, baseFile, dlcFiles: [...updates, ...dlcFiles] })
  }

  return result
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
