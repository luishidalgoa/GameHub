/**
 * scripts/remap-paths.ts
 *
 * Remap the absolute game paths stored in the database when moving the SQLite
 * DB between systems (e.g. Linux Raspberry Pi <-> Windows dev machine).
 *
 * Everything AFTER each storage-disk root is that disk's own content and is
 * preserved verbatim; only the disk root and the path separator change. So a
 * disk that lives at "E:\Preservacion videojuegos\..." on Windows keeps that
 * subfolder when its root is mapped to "/mnt/nextcloud_hdd_1" on Linux.
 *
 * The tool:
 *   1. detects the distinct disk roots used in the DB,
 *   2. asks the target OS (windows / linux),
 *   3. asks the new location of each detected root,
 *   4. rewrites Platform.scanPath, Game.filePath and GameDlc.filePath,
 *      converting "/" <-> "\" for the target OS.
 *
 * Usage:
 *   npm run db:remap                          # interactive (uses prisma/gamehub.db)
 *   npx tsx scripts/remap-paths.ts --detect   # only print detected roots, no changes
 *   npx tsx scripts/remap-paths.ts <path-to.db>
 */
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { createInterface } from 'readline/promises'

type OS = 'windows' | 'linux'

// -- Path helpers ------------------------------------------------------------

export function detectOS(p: string): OS {
  if (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')) return 'windows'
  if (p.startsWith('/')) return 'linux'
  return p.includes('\\') ? 'windows' : 'linux'
}

/** Split on either separator. Posix-absolute paths keep a leading "" segment. */
function toSegments(p: string): string[] {
  return p.split(/[\\/]+/)
}

function joinOS(segments: string[], os: OS): string {
  if (os === 'linux' && segments[0] === '') {
    return '/' + segments.slice(1).join('/')
  }
  return segments.join(os === 'windows' ? '\\' : '/')
}

function commonPrefixLen(lists: string[][]): number {
  if (lists.length === 0) return 0
  let i = 0
  for (;;) {
    const v = lists[0][i]
    if (v === undefined) break
    if (!lists.every((l) => l[i] === v)) break
    i++
  }
  return i
}

function startsWithSegs(segs: string[], prefix: string[]): boolean {
  if (prefix.length > segs.length) return false
  for (let i = 0; i < prefix.length; i++) if (segs[i] !== prefix[i]) return false
  return true
}

// -- Disk-root detection -----------------------------------------------------
//
// The "root" is the storage-disk identifier; everything after it is preserved.
//   Windows -> the drive letter           ("F:", "E:")
//   Linux   -> common prefix + 1 segment  ("/mnt/F", "/mnt/nextcloud_hdd_1")

interface Root { display: string; segments: string[] }

export function detectRoots(paths: string[], os: OS): Root[] {
  const lists = paths.map(toSegments)
  const rootMap = new Map<string, string[]>()

  if (os === 'windows') {
    // Drive letter (e.g. ["F:"]); UNC share fallback (["", "", server, share]).
    for (const segs of lists) {
      const rootSegs = segs[0] === '' ? segs.slice(0, 4) : segs.slice(0, 1)
      rootMap.set(rootSegs.join('\n'), rootSegs)
    }
  } else {
    // Common ancestor (e.g. "/mnt") + the disk-identifying segment.
    const L = commonPrefixLen(lists)
    for (const segs of lists) {
      const rootSegs = segs.slice(0, Math.min(L + 1, segs.length))
      rootMap.set(rootSegs.join('\n'), rootSegs)
    }
  }

  return [...rootMap.values()]
    .map((segments) => ({ display: joinOS(segments, os), segments }))
    .sort((a, b) => a.display.localeCompare(b.display))
}

export function remapPath(
  original: string,
  roots: Root[],
  mapping: Map<string, string>,
  targetOS: OS,
): string | null {
  const segs = toSegments(original)
  // Match the most specific (longest) root prefix.
  const match = [...roots]
    .sort((a, b) => b.segments.length - a.segments.length)
    .find((r) => startsWithSegs(segs, r.segments))
  if (!match) return null

  const newRoot   = (mapping.get(match.display) ?? match.display).replace(/[\\/]+$/, '')
  const remainder = segs.slice(match.segments.length).filter((s) => s !== '')
  const sep       = targetOS === 'windows' ? '\\' : '/'
  return remainder.length ? `${newRoot}${sep}${remainder.join(sep)}` : newRoot
}

// -- Main --------------------------------------------------------------------

function resolveDbPath(argPath?: string): string {
  if (argPath) return path.resolve(argPath)
  return path.resolve(process.cwd(), 'prisma', 'gamehub.db') // DATABASE_URL="file:./gamehub.db"
}

interface PlatformRow { id: number; scanPath: string }
interface PathRow     { id: number; filePath: string }

async function main() {
  const args       = process.argv.slice(2)
  const detectOnly = args.includes('--detect') || args.includes('--dry')
  const dbArg      = args.find((a) => !a.startsWith('--'))
  const dbPath     = resolveDbPath(dbArg)

  if (!fs.existsSync(dbPath)) {
    console.error(`No se encontro la base de datos: ${dbPath}`)
    process.exit(1)
  }

  const db        = new Database(dbPath)
  const platforms = db.prepare('SELECT id, scanPath FROM Platform').all() as PlatformRow[]
  const games     = db.prepare('SELECT id, filePath FROM Game').all() as PathRow[]
  const dlcs      = db.prepare('SELECT id, filePath FROM GameDlc').all() as PathRow[]

  const scanPaths = [...new Set(
    platforms.flatMap((p) => (p.scanPath ?? '').split('|').map((s) => s.trim()).filter(Boolean)),
  )]

  if (scanPaths.length === 0) {
    console.error('No hay rutas de escaneo en la base de datos. Nada que remapear.')
    db.close()
    process.exit(1)
  }

  const sourceOS = detectOS(scanPaths[0])
  const roots    = detectRoots(scanPaths, sourceOS)
  const allPaths = [...scanPaths, ...games.map((g) => g.filePath), ...dlcs.map((d) => d.filePath)]

  console.log('\n=== GameHub - Remapeo de rutas ===')
  console.log(`Base de datos:   ${dbPath}`)
  console.log(`OS de origen:    ${sourceOS}`)
  console.log(`\nRutas raiz detectadas (${roots.length}):`)
  for (const [i, r] of roots.entries()) {
    const count = allPaths.filter((p) => startsWithSegs(toSegments(p), r.segments)).length
    console.log(`  [${i + 1}] ${r.display}   (${count} rutas)`)
  }
  console.log('\nRutas de escaneo configuradas:')
  for (const s of scanPaths) console.log(`  - ${s}`)

  if (detectOnly) { db.close(); return }

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  // 1. Target OS
  let targetOS: OS
  for (;;) {
    const ans = (await rl.question('\nA que sistema estas importando? (windows/linux): ')).trim().toLowerCase()
    if (ans === 'windows' || ans === 'win') { targetOS = 'windows'; break }
    if (ans === 'linux'   || ans === 'lin') { targetOS = 'linux';   break }
    console.log('  Responde "windows" o "linux".')
  }

  // 2. New root for each detected disk
  const mapping = new Map<string, string>()
  console.log(`\nIndica la nueva ruta raiz de cada disco (formato ${targetOS}, vacio = sin cambios):`)
  for (const r of roots) {
    const ans = (await rl.question(`  ${r.display}\n     -> `)).trim()
    mapping.set(r.display, ans || r.display)
  }

  // 3. Preview
  console.log('\nEjemplos de cambios:')
  for (const s of scanPaths.slice(0, 6)) {
    console.log(`  ${s}\n     -> ${remapPath(s, roots, mapping, targetOS) ?? '(sin cambios)'}`)
  }

  const confirm = (await rl.question(
    `\nAplicar a ${platforms.length} plataforma(s), ${games.length} juego(s) y ${dlcs.length} extra(s)? (y/N): `,
  )).trim().toLowerCase()
  rl.close()

  if (!['y', 'yes', 's', 'si'].includes(confirm)) {
    console.log('Cancelado. No se ha modificado nada.')
    db.close()
    return
  }

  // 4. Apply (single transaction)
  const updPlatform = db.prepare('UPDATE Platform SET scanPath = ? WHERE id = ?')
  const updGame     = db.prepare('UPDATE Game SET filePath = ? WHERE id = ?')
  const updDlc      = db.prepare('UPDATE GameDlc SET filePath = ? WHERE id = ?')

  let nPlat = 0, nGame = 0, nDlc = 0, nSkip = 0

  const apply = db.transaction(() => {
    for (const p of platforms) {
      const parts    = (p.scanPath ?? '').split('|').map((s) => s.trim()).filter(Boolean)
      const remapped = parts.map((s) => remapPath(s, roots, mapping, targetOS) ?? s).join('|')
      if (remapped !== p.scanPath) { updPlatform.run(remapped, p.id); nPlat++ }
    }
    for (const g of games) {
      const np = remapPath(g.filePath, roots, mapping, targetOS)
      if (np === null) { nSkip++; continue }
      if (np !== g.filePath) { updGame.run(np, g.id); nGame++ }
    }
    for (const d of dlcs) {
      const np = remapPath(d.filePath, roots, mapping, targetOS)
      if (np === null) { nSkip++; continue }
      if (np !== d.filePath) { updDlc.run(np, d.id); nDlc++ }
    }
  })
  apply()
  db.close()

  console.log(`\nHecho. Plataformas: ${nPlat} - Juegos: ${nGame} - Extras: ${nDlc}.`)
  if (nSkip) console.log(`  (${nSkip} ruta(s) no coincidian con ninguna raiz detectada; sin cambios.)`)
  console.log('Reinicia el contenedor / dev server para que tome las nuevas rutas.')
}

// Only run the interactive flow when invoked directly (not when imported).
const invokedDirectly = !!process.argv[1] && /remap-paths\.(ts|js|mjs|cjs)$/.test(process.argv[1])
if (invokedDirectly) {
  main().catch((err) => { console.error(err); process.exit(1) })
}
