import path from 'path'
import { db } from '@/lib/db'
import { cleanTitle, extractRegion, toSortTitle } from '@/lib/utils'
import { walkDirectory, scanSwitchFolders, scanPortsFolders } from './walker'
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
  const baseFile = folder.baseFile!
  const title    = titleOverride ?? cleanTitle(folder.folderName)
  const region   = extractRegion(folder.folderName)

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
    const existing = await db.game.findUnique({ where: { filePath: baseFile.filePath } })
    if (!existing) {
      const game = await db.game.create({
        data: { filePath: baseFile.filePath, fileName: baseFile.fileName, fileSize: baseFile.fileSize, platformId, title, sortTitle: toSortTitle(title), region, lastSeenAt: scanStart },
      })
      await upsertDlcs(game.id)
      emitFn({ type: 'file_found', filePath: baseFile.filePath, isNew: true, platform: platformName })
      return { added: 1, updated: 0 }
    } else {
      await db.game.update({ where: { id: existing.id }, data: { fileSize: baseFile.fileSize, lastSeenAt: scanStart } })
      await upsertDlcs(existing.id)
      emitFn({ type: 'file_found', filePath: baseFile.filePath, isNew: false, platform: platformName })
      return { added: 0, updated: 1 }
    }
  } catch (err) {
    errors.push(`Error processing ${baseFile.filePath}: ${err}`)
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

    try {
      const mode = (platform.scanMode ?? 'flat') as 'flat' | 'folder' | 'ports'

      for (const scanPath of scanPaths) {
      if (mode === 'folder') {
        // ── Folder-style: one folder = one game (Switch) ─────────────────────
        const folders = scanSwitchFolders(scanPath, extensions, /dlc|update|patch/i)
        for (const folder of folders) {
          if (!folder.baseFile) continue
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
              await db.game.update({ where: { id: existing.id }, data: { fileSize: file.fileSize, lastSeenAt: scanStart } })
              updated++
              emit({ type: 'file_found', filePath: file.filePath, isNew: false, platform: platform.name })
            }
          } catch (err) { errors.push(`Error processing ${file.filePath}: ${err}`) }
          if (found % 20 === 0) await tick()
        }

        for (const folder of folders) {
          if (!folder.baseFile) continue
          const { added: a, updated: u } = await upsertFolderGame(
            folder, platform.id, scanStart, errors, emit, platform.name,
            cleanTitle(folder.folderName),
          )
          found++; added += a; updated += u
          if (found % 20 === 0) await tick()
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
              await db.game.update({ where: { id: existing.id }, data: { fileSize: file.fileSize, lastSeenAt: scanStart } })
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

    // Mark stale games for this platform (not seen in this scan)
    const staleResult = await db.game.updateMany({
      where: {
        platformId: platform.id,
        lastSeenAt: { lt: scanStart },
      },
      data: { isHidden: true },
    })

    const stale = staleResult.count
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
