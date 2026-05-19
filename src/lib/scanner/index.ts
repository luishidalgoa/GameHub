import path from 'path'
import fs from 'fs'
import { db } from '@/lib/db'
import { cleanTitle, extractRegion, toSortTitle } from '@/lib/utils'
import { walkDirectory, scanSwitchFolders, scanPortsFolders, walkFlatWithDlcDetection, extractGameKey } from './walker'
import type { SwitchGameFolder } from './walker'
import { scanBus } from './events'
import type { ScanEvent } from './events'
import { triggerAutoMetadata } from '@/lib/metadata/auto'

function emit(event: ScanEvent) {
  scanBus.emit('scan', event)
}

// ── Shared helper: upsert a folder-based game (Switch or Ports) ───────────────

async function upsertFolderGame(
  folder:       SwitchGameFolder,
  platformId:   number,
  scanStart:    Date,
  errors:       string[],
  emitFn:       (e: ScanEvent) => void,
  platformName: string,
  titleOverride?: string,
): Promise<{ added: number; updated: number }> {
  const title  = titleOverride ?? cleanTitle(folder.folderName)
  const region = extractRegion(folder.folderName)

  // When there is no base file, use the folder path itself as the unique key
  // so updates / DLC / mods without a base game are still catalogued.
  const filePath = folder.baseFile?.filePath ?? folder.folderPath
  const fileName = folder.baseFile?.fileName ?? ''
  const fileSize = folder.baseFile?.fileSize ?? BigInt(0)

  const upsertDlcs = async (gameId: number) => {
    for (const dlc of folder.dlcFiles) {
      await db.gameDlc.upsert({
        where:  { filePath: dlc.filePath },
        update: { fileSize: dlc.fileSize, type: dlc.type ?? 'dlc' },
        create: {
          gameId,
          filePath: dlc.filePath,
          fileName: dlc.fileName,
          fileSize: dlc.fileSize,
          title:    cleanTitle(dlc.fileName),
          type:     dlc.type ?? 'dlc',
        },
      })
    }
  }

  try {
    const existing = await db.game.findUnique({ where: { filePath } })
    if (!existing) {
      const game = await db.game.create({
        data: { filePath, fileName, fileSize, platformId, title, sortTitle: toSortTitle(title), region, lastSeenAt: scanStart },
      })
      await upsertDlcs(game.id)
      emitFn({ type: 'file_found', filePath, isNew: true, platform: platformName })
      return { added: 1, updated: 0 }
    } else {
      await db.game.update({ where: { id: existing.id }, data: { fileSize, lastSeenAt: scanStart, isHidden: false } })
      await upsertDlcs(existing.id)
      emitFn({ type: 'file_found', filePath, isNew: false, platform: platformName })
      return { added: 0, updated: 1 }
    }
  } catch (err) {
    errors.push(`Error processing ${filePath}: ${err}`)
    return { added: 0, updated: 0 }
  }
}

/** Yield control to the event loop so SSE and other I/O can flush. */
const tick = () => new Promise<void>(r => setImmediate(r))

export async function runScan(triggeredBy = 'manual', platformSlug?: string) {
  const scanStart = new Date()
  emit({ type: 'scan_start' })

  let totalFound = 0, totalAdded = 0, totalUpdated = 0, totalStale = 0
  const errors: string[] = []

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
    const extensions = platform.extensions.split(',').map(e => e.trim()).filter(Boolean)
    // Support multiple scan paths separated by '|' (pipe)
    const scanPaths = platform.scanPath.split('|').map(p => p.trim()).filter(Boolean)
    // Track whether all paths were accessible — skip stale marking if any were unreachable
    let allPathsAccessible = true

    try {
      const mode = (platform.scanMode ?? 'flat') as 'flat' | 'folder' | 'ports'

      for (const scanPath of scanPaths) {
      // Verify the path is accessible before scanning
      if (!fs.existsSync(scanPath)) {
        const msg = `[WARN] Scan path not found or inaccessible: "${scanPath}" (platform: ${platform.name})`
        errors.push(msg)
        allPathsAccessible = false
        continue
      }

      if (mode === 'folder') {
        // ── Folder-style: one folder = one game (Switch) ─────────────────────
        const folders = scanSwitchFolders(scanPath, extensions, /dlc|update|patch/i)
        for (const folder of folders) {
          // Process even when there is no base game file (updates/DLC/mods only)
          if (!folder.baseFile && folder.dlcFiles.length === 0) continue
          const { added: a, updated: u } = await upsertFolderGame(folder, platform.id, scanStart, errors, emit, platform.name)
          found++; added += a; updated += u
          if (found % 20 === 0) await tick()
        }

      } else if (mode === 'ports') {
        // ── Ports-style: root files + root folders, each = one game ──────────
        const { loose, folders } = scanPortsFolders(scanPath, extensions)

        for (const file of loose) {
          found++
          const title  = cleanTitle(path.basename(file.fileName, path.extname(file.fileName)))
          const region = extractRegion(file.fileName)
          try {
            const existing = await db.game.findUnique({ where: { filePath: file.filePath } })
            if (!existing) {
              await db.game.create({ data: { filePath: file.filePath, fileName: file.fileName, fileSize: file.fileSize, platformId: platform.id, title, sortTitle: toSortTitle(title), region, lastSeenAt: scanStart } })
              added++
              emit({ type: 'file_found', filePath: file.filePath, isNew: true, platform: platform.name })
            } else {
              await db.game.update({ where: { id: existing.id }, data: { fileSize: file.fileSize, lastSeenAt: scanStart, isHidden: false } })
              updated++
              emit({ type: 'file_found', filePath: file.filePath, isNew: false, platform: platform.name })
            }
          } catch (err) { errors.push(`Error processing ${file.filePath}: ${err}`) }
          if (found % 20 === 0) await tick()
        }

        for (const folder of folders) {
          if (!folder.baseFile && folder.dlcFiles.length === 0) continue
          const { added: a, updated: u } = await upsertFolderGame(
            folder, platform.id, scanStart, errors, emit, platform.name,
            cleanTitle(folder.folderName),
          )
          found++; added += a; updated += u
          if (found % 20 === 0) await tick()
        }

      } else if ((platform as { scanDlc?: boolean }).scanDlc) {
        // ── Flat + DLC: Title-ID-aware scan (3DS / NDS) ───────────────────────
        // Pass 1: upsert base game files, build gameKey → id map for linking
        const { games: baseFiles, updates, dlcs } = walkFlatWithDlcDetection(scanPath, extensions)
        const gameKeyMap = new Map<string, number>()

        for (const file of baseFiles) {
          found++
          const title  = cleanTitle(file.fileName)
          const region = extractRegion(file.fileName)
          try {
            const existing = await db.game.findUnique({ where: { filePath: file.filePath } })
            let gameId: number
            if (!existing) {
              const game = await db.game.create({ data: { filePath: file.filePath, fileName: file.fileName, fileSize: file.fileSize, platformId: platform.id, title, sortTitle: toSortTitle(title), region, lastSeenAt: scanStart } })
              added++
              gameId = game.id
              emit({ type: 'file_found', filePath: file.filePath, isNew: true, platform: platform.name })
            } else {
              await db.game.update({ where: { id: existing.id }, data: { fileSize: file.fileSize, lastSeenAt: scanStart, isHidden: false } })
              updated++
              gameId = existing.id
              emit({ type: 'file_found', filePath: file.filePath, isNew: false, platform: platform.name })
            }
            const key = extractGameKey(file.fileName)
            if (key) gameKeyMap.set(key, gameId)
          } catch (err) { errors.push(`Error processing ${file.filePath}: ${err}`) }
          if (found % 20 === 0) await tick()
        }

        // Pass 2: link updates/DLCs to their base game via matching Title ID key
        for (const dlc of [...updates, ...dlcs]) {
          const key = extractGameKey(dlc.fileName)
          let gameId = key ? gameKeyMap.get(key) : undefined

          // Fall back to DB lookup (e.g. base game was scanned in a previous run)
          if (gameId === undefined && key) {
            const baseGame = await db.game.findFirst({
              where: { platformId: platform.id, fileName: { contains: key }, isHidden: false },
            })
            if (baseGame) gameId = baseGame.id
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

      } else {
        // ── Flat: walk recursively, each file = one game ─────────────────────
        for (const file of walkDirectory(scanPath, extensions)) {
          found++
          const title  = cleanTitle(file.fileName)
          const region = extractRegion(file.fileName)
          try {
            const existing = await db.game.findUnique({ where: { filePath: file.filePath } })
            if (!existing) {
              await db.game.create({ data: { filePath: file.filePath, fileName: file.fileName, fileSize: file.fileSize, platformId: platform.id, title, sortTitle: toSortTitle(title), region, lastSeenAt: scanStart } })
              added++
              emit({ type: 'file_found', filePath: file.filePath, isNew: true, platform: platform.name })
            } else {
              await db.game.update({ where: { id: existing.id }, data: { fileSize: file.fileSize, lastSeenAt: scanStart, isHidden: false } })
              updated++
              emit({ type: 'file_found', filePath: file.filePath, isNew: false, platform: platform.name })
            }
          } catch (err) { errors.push(`Error processing ${file.filePath}: ${err}`) }
          if (found % 20 === 0) await tick()
        }
      }
      } // end for scanPath
    } catch (err) {
      const msg = `Error scanning platform ${platform.name}: ${err}`
      errors.push(msg)
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
    } else {
      errors.push(`[INFO] Stale-marking skipped for "${platform.name}" because one or more scan paths were inaccessible.`)
    }
    totalStale += stale
    totalFound += found
    totalAdded += added
    totalUpdated += updated

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
      gamesFound: totalFound,
      gamesAdded: totalAdded,
      gamesUpdated: totalUpdated,
      gamesStale: totalStale,
      errors: errors.length > 0 ? JSON.stringify(errors) : null,
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
    // Fire auto-metadata in the background — don't await so the scan API returns immediately
    triggerAutoMetadata(emit).catch((err) => {
      emit({ type: 'pipeline_done', message: `Auto-metadata error: ${err}` })
    })
  } else {
    emit({ type: 'pipeline_done' })
  }

  return log.id
}
