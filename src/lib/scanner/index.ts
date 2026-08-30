import path from 'path'
import fs from 'fs'
import fsp from 'fs/promises'
import { db } from '@/lib/db'
import { cleanTitle, toSortTitle } from '@/lib/utils'
import { parseRomTags, languagesToCsv, gameGroupKey } from '@/lib/rom-tags'
import { walkDirectory, scanSwitchFolders, scanPortsFolders, walkFlatWithDlcDetection, extractGameKey } from './walker'
import type { SwitchGameFolder, FileEntry } from './walker'
import { extractSwitchTitleId, classifySwitchTitleId, switchGroupKey, nameGroupKey } from './titleid'
import { consolidatePlatform } from './regions'
import { scanBus } from './events'
import type { ScanEvent } from './events'
import { triggerAutoMetadata } from '@/lib/metadata/auto'

function emit(event: ScanEvent) {
  scanBus.emit('scan', event)
}

/** How many stat() calls may be in flight while checking add-on rows. Matches
 *  the shop's index scan: enough to hide network-share latency, low enough not
 *  to thrash a spinning disk. */
const ADDON_STAT_CONCURRENCY = 32

/**
 * Ids of add-on rows whose file is *provably* gone.
 *
 * Only ENOENT counts. Any other failure — permission denied, share hiccup, I/O
 * error — leaves the row alone: "I could not check" must never be treated as "it
 * is not there", or one bad moment on a network share would delete real rows.
 * Async and bounded rather than `existsSync` in a loop, which blocks the event
 * loop once per file on a bind-mounted `/mnt` and stalls every other request.
 */
async function missingAddonIds(
  addons: readonly { id: number; filePath: string }[],
): Promise<number[]> {
  const missing: number[] = []
  let next = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++
      if (i >= addons.length) return
      try {
        await fsp.stat(addons[i].filePath)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') missing.push(addons[i].id)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(ADDON_STAT_CONCURRENCY, addons.length) }, worker),
  )
  return missing
}

/** Region + languages CSV parsed from a file (or folder) name. */
function tagFields(name: string): { region: string | null; languages: string | null } {
  const t = parseRomTags(name)
  return { region: t.region, languages: languagesToCsv(t.languages) }
}

// ── Folder-based game unification (Switch / Ports) ────────────────────────────

type FileKind = 'base' | 'update' | 'dlc' | 'mod'

/** Classify a file as base / update / dlc / mod (Title-ID aware for Switch). */
function classifyFile(f: FileEntry, switchMode: boolean): FileKind {
  if (f.type === 'mod') return 'mod'
  if (switchMode) {
    const tid = extractSwitchTitleId(f.fileName)
    if (tid) return classifySwitchTitleId(tid)
  }
  if (!f.type) return 'base'           // walker's baseFile carries no type
  if (f.type === 'update') return 'update'
  if (f.type === 'dlc')    return 'dlc'
  return 'base'
}

/**
 * Merge `srcId` into `dstId`: move its DLC rows over, preserve its own file as
 * an extra (update/dlc) on the destination, then delete the source row.
 */
// La fila que ya representa a este juego, si la hay.
//
// Se busca por ruta y, si no aparece, por groupKey dentro de la plataforma:
// convertir un volcado cambia la extension pero no el juego, y el groupKey la
// ignora --sale de cleanTitle(), que recorta cualquier extension--.
//
// Sin el segundo intento, "Juego.iso" -> "Juego.chd" se ve como un juego
// NUEVO: se crea una fila y acto seguido el colapso de duplicados, que si
// agrupa por groupKey, la fusiona contra la vieja y la borra. El escaneo dice
// "N anadidos" en cada pasada sin que nada cambie, la fila vieja se queda en
// el cementerio apuntando a un fichero inexistente, y la descripcion, la
// caratula y el trailer se pierden.
//
// Vive aqui, y no repetida en cada bucle, porque hay CUATRO sitios que crean
// juegos --sueltos, agrupados por carpeta, recorrido plano-- y arreglar solo
// algunos fue exactamente el error que hizo falta corregir dos veces.
async function findExistingGame(platformId: number, filePath: string, groupKey: string) {
  const byPath = await db.game.findUnique({ where: { filePath } })
  if (byPath) return byPath
  return db.game.findFirst({ where: { platformId, groupKey } })
}

async function reparentAndDelete(srcId: number, dstId: number, switchMode: boolean) {
  const src = await db.game.findUnique({ where: { id: srcId } })
  if (!src || src.id === dstId) return

  await db.gameDlc.updateMany({ where: { gameId: srcId }, data: { gameId: dstId } })

  if (src.fileSize > BigInt(0)) {
    const dst = await db.game.findUnique({ where: { id: dstId } })
    if (dst && dst.filePath !== src.filePath) {
      const already = await db.gameDlc.findUnique({ where: { filePath: src.filePath } })
      if (!already) {
        const tid  = switchMode ? extractSwitchTitleId(src.fileName) : null
        // Non-Switch siblings sharing a group key are region variants of the
        // same game → keep them as downloadable 'region' editions.
        const kind = tid ? classifySwitchTitleId(tid) : 'region'
        if (kind !== 'base') {
          const tags = kind === 'region' ? tagFields(src.fileName) : { region: null, languages: null }
          await db.gameDlc.create({
            data: { gameId: dstId, filePath: src.filePath, fileName: src.fileName, fileSize: src.fileSize, title: tags.region ?? cleanTitle(src.fileName), type: kind, region: tags.region, languages: tags.languages },
          }).catch(() => {})
        }
      }
    }
  }

  await db.game.delete({ where: { id: srcId } }).catch(() => {})
}

interface GroupScanResult {
  found: number; added: number; updated: number
  dlcsFound: number; updatesFound: number; modsFound: number
}

/**
 * Group all scanned folders by a stable key (Switch base Application ID, or the
 * normalized folder name as fallback) and materialise each group into a single
 * canonical game with its updates / DLC / mods attached — even when the files
 * live in different scan directories.
 */
async function processFolderGroups(
  folders:      SwitchGameFolder[],
  platformId:   number,
  scanStart:    Date,
  errors:       string[],
  emitFn:       (e: ScanEvent) => void,
  platformName: string,
  switchMode:   boolean,
): Promise<GroupScanResult> {
  const res: GroupScanResult = { found: 0, added: 0, updated: 0, dlcsFound: 0, updatesFound: 0, modsFound: 0 }
  const bySize = (a: FileEntry, b: FileEntry) => (a.fileSize > b.fileSize ? -1 : a.fileSize < b.fileSize ? 1 : 0)

  // 1. Group folders by stable key
  const groups = new Map<string, SwitchGameFolder[]>()
  for (const folder of folders) {
    const names = [folder.baseFile, ...folder.dlcFiles].filter(Boolean).map(f => (f as FileEntry).fileName)
    const key   = (switchMode ? switchGroupKey(names) : null) ?? nameGroupKey(folder.folderName)
    const arr   = groups.get(key)
    if (arr) arr.push(folder); else groups.set(key, [folder])
  }

  // 2. Materialise each group into one canonical game + extras
  for (const [groupKey, groupFolders] of groups) {
    res.found++
    try {
      const seen  = new Set<string>()
      const files: Array<FileEntry & { kind: FileKind }> = []
      for (const folder of groupFolders) {
        for (const f of [folder.baseFile, ...folder.dlcFiles]) {
          if (!f || seen.has(f.filePath)) continue
          seen.add(f.filePath)
          files.push({ ...f, kind: classifyFile(f, switchMode) })
        }
      }
      if (files.length === 0) continue

      // Pick the base: largest 'base'-classified file; for non-Switch folders
      // (no Title IDs) fall back to the largest file overall.
      let base = files.filter(f => f.kind === 'base').sort(bySize)[0]
      if (!base && !switchMode) {
        base = [...files].sort(bySize)[0]
        if (base) base.kind = 'base'
      }
      const extras = files.filter(f => f !== base)

      const titleFolder = groupFolders.find(f => f.baseFile && f.baseFile.filePath === base?.filePath) ?? groupFolders[0]
      const title  = cleanTitle(titleFolder.folderName)
      // Region/languages: prefer the base ROM's own name (carries the (En,Es…)
      // tags); fall back to the folder name.
      const { region, languages } = tagFields(base?.fileName ?? titleFolder.folderName)

      const baseData = base
        ? { filePath: base.filePath, fileName: base.fileName, fileSize: base.fileSize }
        : { filePath: groupFolders[0].folderPath, fileName: '', fileSize: BigInt(0) }

      // Find (or adopt) the canonical game row
      let canonical = await db.game.findFirst({ where: { platformId, groupKey } })
      if (!canonical) {
        const candidatePaths = files.map(f => f.filePath).concat(groupFolders.map(f => f.folderPath))
        canonical = await db.game.findFirst({ where: { platformId, filePath: { in: candidatePaths } } })
      }

      if (!canonical) {
        canonical = await db.game.create({
          data: { ...baseData, platformId, title, sortTitle: toSortTitle(title), region, languages, groupKey, lastSeenAt: scanStart },
        })
        res.added++
        emitFn({ type: 'file_found', filePath: baseData.filePath, isNew: true, platform: platformName })
      } else {
        // Only (re)write the base file fields when we actually found a base in
        // this scan — otherwise we'd clobber an existing base whose disk is
        // simply offline right now with the empty folder sentinel.
        const updateData: { groupKey: string; lastSeenAt: Date; isHidden: boolean; region: string | null; languages: string | null; filePath?: string; fileName?: string; fileSize?: bigint } =
          { groupKey, lastSeenAt: scanStart, isHidden: false, region, languages }
        if (base) {
          // Free the target file path from any other row first
          const occ = await db.game.findUnique({ where: { filePath: base.filePath } })
          if (occ && occ.id !== canonical.id) await reparentAndDelete(occ.id, canonical.id, switchMode)
          updateData.filePath = base.filePath
          updateData.fileName = base.fileName
          updateData.fileSize = base.fileSize
        }
        await db.game.update({ where: { id: canonical.id }, data: updateData })
        res.updated++
        emitFn({ type: 'file_found', filePath: updateData.filePath ?? canonical.filePath, isNew: false, platform: platformName })
      }

      // Attach extras as update / dlc / mod / region. A non-Switch 'base' extra
      // is an alternate-region copy of the same game → store it as 'region'.
      for (const e of extras) {
        const etype = (!switchMode && e.kind === 'base') ? 'region' : e.kind
        const etags = etype === 'region' ? tagFields(e.fileName) : { region: null, languages: null }
        await db.gameDlc.upsert({
          where:  { filePath: e.filePath },
          update: { gameId: canonical.id, fileSize: e.fileSize, type: etype, region: etags.region, languages: etags.languages },
          create: { gameId: canonical.id, filePath: e.filePath, fileName: e.fileName, fileSize: e.fileSize, title: etags.region ?? cleanTitle(e.fileName), type: etype, region: etags.region, languages: etags.languages },
        }).catch(err => errors.push(`Error linking ${e.filePath}: ${err}`))
        if (etype === 'mod') res.modsFound++
        else if (etype === 'update') res.updatesFound++
        else if (etype === 'region') {/* alternate region, surfaced in the picker */}
        else res.dlcsFound++
      }

      // Collapse any duplicate rows sharing this group key
      const dupes = await db.game.findMany({ where: { platformId, groupKey, id: { not: canonical.id } } })
      for (const d of dupes) await reparentAndDelete(d.id, canonical.id, switchMode)

      // Collapse leftover pre-feature rows whose file path we just absorbed
      const extraPaths = extras.map(e => e.filePath).concat(groupFolders.map(f => f.folderPath))
      if (extraPaths.length) {
        const leftovers = await db.game.findMany({ where: { platformId, filePath: { in: extraPaths }, id: { not: canonical.id } } })
        for (const lo of leftovers) await reparentAndDelete(lo.id, canonical.id, switchMode)
      }
    } catch (err) {
      errors.push(`Error processing group ${groupKey}: ${err}`)
    }

    if (res.found % 20 === 0) await tick()
  }

  return res
}

/** Yield control to the event loop so SSE and other I/O can flush. */
const tick = () => new Promise<void>(r => setImmediate(r))

export interface PlatformScanSummary {
  platform:     string
  gamesAdded:   number
  gamesUpdated: number
  gamesStale:   number
  dlcsFound:    number
  updatesFound: number
  modsFound:    number
}

export async function runScan(triggeredBy = 'manual', platformSlug?: string) {
  const scanStart = new Date()
  emit({ type: 'scan_start' })

  let totalFound = 0, totalAdded = 0, totalUpdated = 0, totalStale = 0
  const errors: string[] = []
  const breakdown: PlatformScanSummary[] = []

  const log = await db.scanLog.create({
    data: { triggeredBy, startedAt: scanStart },
  })

  const platforms = await db.platform.findMany({
    where: platformSlug
      ? { slug: platformSlug, enabled: true }
      : { enabled: true },
    orderBy: { sortOrder: 'asc' },
  })

  for (const platform of platforms) {
    emit({ type: 'platform_start', platform: platform.name })

    let found = 0, added = 0, updated = 0
    let dlcsFound = 0, updatesFound = 0, modsFound = 0
    const extensions = platform.extensions.split(',').map(e => e.trim()).filter(Boolean)
    // Support multiple scan paths separated by '|' (pipe)
    const scanPaths = platform.scanPath.split('|').map(p => p.trim()).filter(Boolean)
    // Track whether all paths were accessible — skip stale marking if any were unreachable
    let allPathsAccessible = true

    try {
      const mode = (platform.scanMode ?? 'flat') as 'flat' | 'folder' | 'ports'

      if (mode === 'folder' || mode === 'ports') {
        // ── Folder / Ports: gather across ALL scan paths first, then group ────
        // This unifies a game whose files live in different directories
        // (e.g. base game on one disk, update + DLC on another).
        const allFolders: SwitchGameFolder[] = []
        const looseFiles: FileEntry[]        = []

        for (const scanPath of scanPaths) {
          if (!fs.existsSync(scanPath)) {
            errors.push(`[WARN] Scan path not found or inaccessible: "${scanPath}" (platform: ${platform.name})`)
            allPathsAccessible = false
            continue
          }
          if (mode === 'folder') {
            allFolders.push(...scanSwitchFolders(scanPath, extensions, /dlc|update|patch/i))
          } else {
            const { loose, folders } = scanPortsFolders(scanPath, extensions)
            looseFiles.push(...loose)
            allFolders.push(...folders)
          }
        }

        // Loose ports files — each is its own game
        for (const file of looseFiles) {
          found++
          const title  = cleanTitle(path.basename(file.fileName, path.extname(file.fileName)))
          const { region, languages } = tagFields(file.fileName)
          const groupKey = gameGroupKey(file.fileName)
          try {
            const existing = await findExistingGame(platform.id, file.filePath, groupKey)
            if (!existing) {
              await db.game.create({ data: { filePath: file.filePath, fileName: file.fileName, fileSize: file.fileSize, platformId: platform.id, title, sortTitle: toSortTitle(title), region, languages, groupKey, lastSeenAt: scanStart } })
              added++
              emit({ type: 'file_found', filePath: file.filePath, isNew: true, platform: platform.name })
            } else {
              await db.game.update({ where: { id: existing.id }, data: { filePath: file.filePath, fileName: file.fileName, fileSize: file.fileSize, region, languages, groupKey, lastSeenAt: scanStart, isHidden: false } })
              updated++
              emit({ type: 'file_found', filePath: file.filePath, isNew: false, platform: platform.name })
            }
          } catch (err) { errors.push(`Error processing ${file.filePath}: ${err}`) }
          if (found % 20 === 0) await tick()
        }

        // Grouped folders — unify base / update / DLC across directories
        const grouped = await processFolderGroups(allFolders, platform.id, scanStart, errors, emit, platform.name, mode === 'folder')
        found += grouped.found; added += grouped.added; updated += grouped.updated
        dlcsFound += grouped.dlcsFound; updatesFound += grouped.updatesFound; modsFound += grouped.modsFound

      } else if (platform.scanDlc) {
        // ── Flat + DLC: Title-ID-aware scan (3DS / NDS) ───────────────────────
        for (const scanPath of scanPaths) {
          if (!fs.existsSync(scanPath)) {
            errors.push(`[WARN] Scan path not found or inaccessible: "${scanPath}" (platform: ${platform.name})`)
            allPathsAccessible = false
            continue
          }
          // Pass 1: upsert base game files, build gameKey → id map for linking
          const { games: baseFiles, updates, dlcs } = walkFlatWithDlcDetection(scanPath, extensions)
          const gameKeyMap  = new Map<string, number>()
          // Second index, by the game folder the base file lives in. Covers the
          // case where neither the base nor its add-on carries a Title ID — the
          // add-on then has nothing to match on and used to be dropped silently.
          const folderMap   = new Map<string, number>()

          // Largest first, so that when a folder holds more than one game file
          // the biggest one claims the folder — same rule Switch mode uses to
          // pick the base game out of a folder.
          baseFiles.sort((a, b) => (a.fileSize > b.fileSize ? -1 : a.fileSize < b.fileSize ? 1 : 0))

          for (const file of baseFiles) {
            found++
            const title  = cleanTitle(file.fileName)
            const { region, languages } = tagFields(file.fileName)
            const groupKey = gameGroupKey(file.fileName)
            try {
              // Buscar por ruta Y, si no, por groupKey: convertir un volcado
              // cambia la extension pero no el juego.
              //
              // Sin el segundo intento, "Juego.iso" -> "Juego.chd" se veia como
              // un juego NUEVO: se creaba una fila, y acto seguido el colapso
              // de duplicados de mas abajo --que si agrupa por groupKey, y el
              // groupKey ignora la extension-- la fusionaba contra la fila
              // vieja y la borraba. El resultado era un escaneo que decia
              // "1 anadido" en cada pasada sin que nada cambiara, la fila vieja
              // en el cementerio apuntando a un fichero inexistente, y la
              // descripcion, la caratula y el trailer perdidos.
              //
              // Encontrando la fila por groupKey se ACTUALIZA la que ya existe:
              // adopta el fichero nuevo, deja de estar oculta y conserva todo
              // lo que se habia curado.
              const existing = await findExistingGame(platform.id, file.filePath, groupKey)
              let gameId: number
              if (!existing) {
                const game = await db.game.create({ data: { filePath: file.filePath, fileName: file.fileName, fileSize: file.fileSize, platformId: platform.id, title, sortTitle: toSortTitle(title), region, languages, groupKey, lastSeenAt: scanStart } })
                added++
                gameId = game.id
                emit({ type: 'file_found', filePath: file.filePath, isNew: true, platform: platform.name })
              } else {
                await db.game.update({ where: { id: existing.id }, data: { filePath: file.filePath, fileName: file.fileName, fileSize: file.fileSize, region, languages, groupKey, lastSeenAt: scanStart, isHidden: false } })
                updated++
                gameId = existing.id
                emit({ type: 'file_found', filePath: file.filePath, isNew: false, platform: platform.name })
              }
              const key = extractGameKey(file.fileName)
              if (key) gameKeyMap.set(key, gameId)
              // Only the FIRST base file of a folder claims it: a folder holding
              // several games is not a grouping, and the biggest file is the one
              // an add-on most likely belongs to.
              if (file.groupDir && !folderMap.has(file.groupDir)) folderMap.set(file.groupDir, gameId)
            } catch (err) { errors.push(`Error processing ${file.filePath}: ${err}`) }
            if (found % 20 === 0) await tick()
          }

          updatesFound += updates.length
          dlcsFound    += dlcs.length

          // Pass 2: attach each update/DLC to its base game. Four ways to find
          // it, cheapest first: by Title ID or by folder within this scan, then
          // the same two against the DB for a base scanned on an earlier run.
          for (const dlc of [...updates, ...dlcs]) {
            const key = extractGameKey(dlc.fileName)
            let gameId = key ? gameKeyMap.get(key) : undefined

            // Same folder as a base game → it belongs to it, Title ID or not.
            if (gameId === undefined && dlc.groupDir) gameId = folderMap.get(dlc.groupDir)

            // Fall back to DB lookup (e.g. base game was scanned in a previous run)
            if (gameId === undefined && key) {
              const baseGame = await db.game.findFirst({
                where: { platformId: platform.id, fileName: { contains: key }, isHidden: false },
              })
              if (baseGame) gameId = baseGame.id
            }
            // Last resort, also from a previous run: the base game's file lives
            // in the same folder, so match on its stored path.
            if (gameId === undefined && dlc.groupDir) {
              const sep      = dlc.filePath.includes('\\') ? '\\' : '/'
              const folderAt = dlc.filePath.indexOf(`${sep}${dlc.groupDir}${sep}`)
              if (folderAt !== -1) {
                const baseGame = await db.game.findFirst({
                  where: {
                    platformId: platform.id,
                    isHidden:   false,
                    filePath:   { startsWith: dlc.filePath.slice(0, folderAt + dlc.groupDir.length + 2) },
                  },
                  orderBy: { fileSize: 'desc' },
                })
                if (baseGame && baseGame.filePath !== dlc.filePath) gameId = baseGame.id
              }
            }

            if (gameId === undefined) continue // orphan — no base game found, skip

            try {
              await db.gameDlc.upsert({
                where:  { filePath: dlc.filePath },
                update: { fileSize: dlc.fileSize, type: dlc.type ?? 'update' },
                create: { gameId, filePath: dlc.filePath, fileName: dlc.fileName, fileSize: dlc.fileSize, title: cleanTitle(dlc.fileName), type: dlc.type ?? 'update' },
              })
            } catch (err) { errors.push(`Error linking DLC ${dlc.filePath}: ${err}`) }
          }
        }

      } else {
        // ── Flat: walk recursively, each file = one game ─────────────────────
        for (const scanPath of scanPaths) {
          if (!fs.existsSync(scanPath)) {
            errors.push(`[WARN] Scan path not found or inaccessible: "${scanPath}" (platform: ${platform.name})`)
            allPathsAccessible = false
            continue
          }
          for (const file of walkDirectory(scanPath, extensions)) {
            found++
            const title  = cleanTitle(file.fileName)
            const { region, languages } = tagFields(file.fileName)
            const groupKey = gameGroupKey(file.fileName)
            try {
              const existing = await findExistingGame(platform.id, file.filePath, groupKey)
              if (!existing) {
                await db.game.create({ data: { filePath: file.filePath, fileName: file.fileName, fileSize: file.fileSize, platformId: platform.id, title, sortTitle: toSortTitle(title), region, languages, groupKey, lastSeenAt: scanStart } })
                added++
                emit({ type: 'file_found', filePath: file.filePath, isNew: true, platform: platform.name })
              } else {
                await db.game.update({ where: { id: existing.id }, data: { filePath: file.filePath, fileName: file.fileName, fileSize: file.fileSize, region, languages, groupKey, lastSeenAt: scanStart, isHidden: false } })
                updated++
                emit({ type: 'file_found', filePath: file.filePath, isNew: false, platform: platform.name })
              }
            } catch (err) { errors.push(`Error processing ${file.filePath}: ${err}`) }
            if (found % 20 === 0) await tick()
          }
        }
      }
    } catch (err) {
      const msg = `Error scanning platform ${platform.name}: ${err}`
      errors.push(msg)
    }

    // Unify region duplicates into a single card (primary edition + 'region'
    // editions) across every scan path of this platform. Runs for all modes,
    // so flat libraries (NDS/3DS) get the same grouping as folder/ports.
    try {
      await consolidatePlatform(platform.id)
    } catch (err) {
      errors.push(`Error consolidating regions for ${platform.name}: ${err}`)
    }

    // Mark stale games only when every scan path was accessible.
    // If any path was unreachable (e.g. network share offline), skip stale marking
    // so we don't accidentally hide games from inaccessible paths.
    let stale = 0
    if (allPathsAccessible) {
      const staleResult = await db.game.updateMany({
        where: {
          platformId: platform.id,
          lastSeenAt: { lt: scanStart },
        },
        data: { isHidden: true },
      })
      stale = staleResult.count

      // Same for add-on rows, which the sweep above cannot reach: `GameDlc` has
      // no `lastSeenAt`, so a DLC or update whose file moved was left behind as a
      // second row pointing at the old path. Renaming a folder — dropping the
      // apostrophe from "Assassin's Creed III Remastered", splitting "Pikmin 1-2"
      // — silently doubled every add-on inside it, because `filePath` is unique
      // and the new path simply inserted alongside the old one.
      //
      // Delete rather than hide: there is no graveyard UI for add-ons, and the
      // row carries nothing worth recovering. Guarded by `allPathsAccessible`
      // like the sweep above, and each path is re-checked individually, so an
      // offline share can never take rows with it.
      const addons = await db.gameDlc.findMany({
        where:  { game: { platformId: platform.id } },
        select: { id: true, filePath: true },
      })
      const orphanIds = await missingAddonIds(addons)
      if (orphanIds.length > 0) {
        const removed = await db.gameDlc.deleteMany({ where: { id: { in: orphanIds } } })
        errors.push(`[INFO] Removed ${removed.count} add-on row(s) for "${platform.name}" whose file no longer exists.`)
      }
    } else {
      errors.push(`[INFO] Stale-marking skipped for "${platform.name}" because one or more scan paths were inaccessible.`)
    }
    totalStale += stale
    totalFound += found
    totalAdded += added
    totalUpdated += updated

    breakdown.push({
      platform:     platform.name,
      gamesAdded:   added,
      gamesUpdated: updated,
      gamesStale:   stale,
      dlcsFound,
      updatesFound,
      modsFound,
    })

    emit({
      type: 'platform_done',
      platform: platform.name,
      count: found,
      added,
      updated,
    })
  }

  const finishedAt = new Date()
  await db.scanLog.update({
    where: { id: log.id },
    data: {
      finishedAt,
      gamesFound:        totalFound,
      gamesAdded:        totalAdded,
      gamesUpdated:      totalUpdated,
      gamesStale:        totalStale,
      errors:            errors.length > 0 ? JSON.stringify(errors) : null,
      platformBreakdown: JSON.stringify(breakdown),
    },
  })

  emit({
    type: 'scan_complete',
    total: totalFound,
    added: totalAdded,
    updated: totalUpdated,
    stale: totalStale,
    logId: log.id,
  })

  if (totalAdded > 0) {
    // Fire auto-metadata in the background — don't await so the scan API returns
    // immediately. Pass through the scanned platform so a single-platform scan
    // only fetches metadata for THAT platform's games, not every game missing it.
    triggerAutoMetadata(emit, platformSlug).catch((err) => {
      emit({ type: 'pipeline_done', message: `Auto-metadata error: ${err}` })
    })
  } else {
    emit({ type: 'pipeline_done' })
  }

  return log.id
}
