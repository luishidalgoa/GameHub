/**
 * scripts/db-import.ts
 *
 * Import a SQLite database (e.g. exported from the Raspberry Pi) into this
 * machine and remap the absolute game paths to this system in one go.
 *
 * Steps:
 *   1. pick a .db file from the current directory (or pass one as an argument),
 *   2. back up the current prisma/gamehub.db,
 *   3. copy the chosen file into place,
 *   4. apply pending Prisma migrations,
 *   5. remap the stored paths: detect the disk roots, ask the target OS and the
 *      new location of each root, then rewrite Platform.scanPath, Game.filePath
 *      and GameDlc.filePath (converting "/" <-> "\").
 *
 *   npm run db:import                 # interactive
 *   npm run db:import -- backup.db    # import a specific file
 */
import Database from 'better-sqlite3'
import { execSync } from 'child_process'
import { createInterface } from 'readline/promises'
import path from 'path'
import fs from 'fs'

type OS = 'windows' | 'linux'

// ── .env loader (so `prisma migrate deploy` gets DATABASE_URL) ──────────────

function loadEnv(): void {
  for (const file of ['.env', '.env.local']) {
    const p = path.resolve(process.cwd(), file)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let val = m[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!(m[1] in process.env)) process.env[m[1]] = val
    }
  }
}

// ── Path helpers ────────────────────────────────────────────────────────────

function detectOS(p: string): OS {
  if (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')) return 'windows'
  if (p.startsWith('/')) return 'linux'
  return p.includes('\\') ? 'windows' : 'linux'
}

function toSegments(p: string): string[] {
  return p.split(/[\\/]+/)
}

function joinOS(segments: string[], os: OS): string {
  if (os === 'linux' && segments[0] === '') return '/' + segments.slice(1).join('/')
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

interface Root { display: string; segments: string[] }

/**
 * Detect the storage-disk roots. Everything after the root is that disk's own
 * content and is preserved verbatim.
 *   Windows -> drive letter           ("F:", "E:")
 *   Linux   -> common prefix + 1 seg  ("/mnt/F", "/mnt/nextcloud_hdd_1")
 */
function detectRoots(paths: string[], os: OS): Root[] {
  const lists = paths.map(toSegments)
  const rootMap = new Map<string, string[]>()

  if (os === 'windows') {
    for (const segs of lists) {
      const rootSegs = segs[0] === '' ? segs.slice(0, 4) : segs.slice(0, 1)
      rootMap.set(rootSegs.join('\n'), rootSegs)
    }
  } else {
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

function remapPath(original: string, roots: Root[], mapping: Map<string, string>, targetOS: OS): string | null {
  const segs = toSegments(original)
  const match = [...roots]
    .sort((a, b) => b.segments.length - a.segments.length)
    .find((r) => startsWithSegs(segs, r.segments))
  if (!match) return null

  const newRoot   = (mapping.get(match.display) ?? match.display).replace(/[\\/]+$/, '')
  const remainder = segs.slice(match.segments.length).filter((s) => s !== '')
  const sep       = targetOS === 'windows' ? '\\' : '/'
  return remainder.length ? `${newRoot}${sep}${remainder.join(sep)}` : newRoot
}

// ── Steps ─────────────────────────────────────────────────────────────────────

const LIVE_DB = path.resolve(process.cwd(), 'prisma', 'gamehub.db')

async function pickSourceFile(rl: ReturnType<typeof createInterface>): Promise<string> {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('--'))
  if (arg) {
    const p = path.resolve(arg)
    if (!fs.existsSync(p)) { console.error(`No existe el archivo: ${p}`); process.exit(1) }
    return p
  }

  const candidates = fs.readdirSync(process.cwd())
    .filter((f) => f.toLowerCase().endsWith('.db'))
    .filter((f) => path.resolve(process.cwd(), f) !== LIVE_DB)

  if (candidates.length === 0) {
    console.error('No hay archivos .db en esta carpeta. Copia aqui el .db exportado y vuelve a ejecutar.')
    process.exit(1)
  }

  console.log('Bases de datos disponibles en esta carpeta:')
  candidates.forEach((f, i) => console.log(`  [${i + 1}] ${f}`))
  for (;;) {
    const ans = (await rl.question('Selecciona numero: ')).trim()
    const idx = parseInt(ans, 10) - 1
    if (idx >= 0 && idx < candidates.length) return path.resolve(process.cwd(), candidates[idx])
    console.log('  Numero no valido.')
  }
}

async function main() {
  loadEnv()
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  // 1. Source file
  const source = await pickSourceFile(rl)
  console.log(`\nArchivo a importar: ${source}`)

  // 2. Back up current DB + copy the new one into place
  if (fs.existsSync(LIVE_DB)) {
    fs.copyFileSync(LIVE_DB, `${LIVE_DB}.bak`)
    console.log(`Copia de seguridad: ${LIVE_DB}.bak`)
  } else {
    fs.mkdirSync(path.dirname(LIVE_DB), { recursive: true })
  }
  fs.copyFileSync(source, LIVE_DB)
  console.log(`Importada en: ${LIVE_DB}`)

  // 3. Apply pending migrations (best-effort)
  const doMigrate = (await rl.question('\nAplicar migraciones pendientes (prisma migrate deploy)? (Y/n): ')).trim().toLowerCase()
  if (doMigrate !== 'n' && doMigrate !== 'no') {
    try {
      execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env })
    } catch {
      console.log('  (No se pudieron aplicar las migraciones automaticamente. Ejecuta luego: npx prisma migrate deploy)')
    }
  }

  // 4. Remap paths
  const db        = new Database(LIVE_DB)
  const platforms = db.prepare('SELECT id, scanPath FROM Platform').all() as { id: number; scanPath: string }[]
  const games     = db.prepare('SELECT id, filePath FROM Game').all() as { id: number; filePath: string }[]
  const dlcs      = db.prepare('SELECT id, filePath FROM GameDlc').all() as { id: number; filePath: string }[]

  const scanPaths = [...new Set(
    platforms.flatMap((p) => (p.scanPath ?? '').split('|').map((s) => s.trim()).filter(Boolean)),
  )]

  if (scanPaths.length === 0) {
    console.log('\nLa BBDD no tiene rutas de escaneo: no hay nada que remapear. Listo.')
    db.close(); rl.close(); return
  }

  const sourceOS = detectOS(scanPaths[0])
  const roots    = detectRoots(scanPaths, sourceOS)

  console.log(`\n=== Remapeo de rutas ===`)
  console.log(`OS de origen (en la BBDD): ${sourceOS}`)
  console.log(`Rutas raiz detectadas (${roots.length}):`)
  roots.forEach((r, i) => console.log(`  [${i + 1}] ${r.display}`))

  const defaultTarget: OS = process.platform === 'win32' ? 'windows' : 'linux'
  let targetOS: OS
  for (;;) {
    const ans = (await rl.question(`\nOS de destino (este sistema) (windows/linux) [${defaultTarget}]: `)).trim().toLowerCase()
    if (ans === '') { targetOS = defaultTarget; break }
    if (ans === 'windows' || ans === 'win') { targetOS = 'windows'; break }
    if (ans === 'linux'   || ans === 'lin') { targetOS = 'linux';   break }
    console.log('  Responde "windows" o "linux".')
  }

  const mapping = new Map<string, string>()
  console.log(`\nIndica la nueva ruta raiz de cada disco (formato ${targetOS}, vacio = sin cambios):`)
  for (const r of roots) {
    const ans = (await rl.question(`  ${r.display}\n     -> `)).trim()
    mapping.set(r.display, ans || r.display)
  }

  console.log('\nEjemplos de cambios:')
  for (const s of scanPaths.slice(0, 6)) {
    console.log(`  ${s}\n     -> ${remapPath(s, roots, mapping, targetOS) ?? '(sin cambios)'}`)
  }

  const confirm = (await rl.question(
    `\nAplicar a ${platforms.length} plataforma(s), ${games.length} juego(s) y ${dlcs.length} extra(s)? (y/N): `,
  )).trim().toLowerCase()
  rl.close()

  if (!['y', 'yes', 's', 'si'].includes(confirm)) {
    console.log('Remapeo cancelado. La BBDD se importo pero las rutas quedaron como en el origen.')
    db.close()
    return
  }

  const updPlatform = db.prepare('UPDATE Platform SET scanPath = ? WHERE id = ?')
  const updGame     = db.prepare('UPDATE Game SET filePath = ? WHERE id = ?')
  const updDlc      = db.prepare('UPDATE GameDlc SET filePath = ? WHERE id = ?')

  let nPlat = 0, nGame = 0, nDlc = 0, nSkip = 0

  db.transaction(() => {
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
  })()
  db.close()

  console.log(`\nHecho. Plataformas: ${nPlat} - Juegos: ${nGame} - Extras: ${nDlc}.`)
  if (nSkip) console.log(`  (${nSkip} ruta(s) no coincidian con ninguna raiz detectada; sin cambios.)`)
  console.log('Reinicia el dev server / contenedor para que tome las nuevas rutas.')
}

main().catch((err) => { console.error(err); process.exit(1) })
