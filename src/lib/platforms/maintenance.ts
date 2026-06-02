import { db } from '@/lib/db'
import {
  coverPathToKey,
  deleteManyFromS3,
  listS3Keys,
  copyS3Object,
  getS3Config,
} from '@/lib/s3'
import { getOriginalCoverPath } from '@/lib/covers'

const COVERS_PREFIX = 'covers'

/** Both stored cover variants (display + original) as bare S3 keys, for a game. */
function gameCoverKeys(coverPath: string | null): string[] {
  const display = coverPathToKey(coverPath)
  if (!display) return []
  // `display` is already a bare key; derive the original variant from it.
  const original = coverPathToKey(getOriginalCoverPath(display))
  return original && original !== display ? [display, original] : [display]
}

/**
 * Delete a platform and everything tied to it, then clean its covers from MinIO.
 *
 * Strategy (per the user's request): walk the platform's games, collect every
 * cover key into one array, delete the DB rows in a transaction, then delete all
 * the covers from MinIO in a single batched call (DeleteObjects) instead of one
 * request per game.
 */
export async function deletePlatformDeep(id: number): Promise<{
  platform: string
  games: number
  coversDeleted: number
}> {
  const platform = await db.platform.findUnique({ where: { id }, select: { slug: true, name: true, iconPath: true } })
  if (!platform) throw new Error('Platform not found')

  const games = await db.game.findMany({
    where: { platformId: id },
    select: { id: true, coverPath: true },
  })
  const gameIds = games.map(g => g.id)

  // Collect all cover keys up-front (before the rows are gone). Include the
  // platform's uploaded icon — its key lives under icons/, OUTSIDE covers/<slug>/,
  // so it would otherwise be orphaned.
  const iconKeys = [coverPathToKey(platform.iconPath), `icons/${platform.slug}.webp`]
    .filter((k): k is string => !!k)
  const coverKeys = [...games.flatMap(g => gameCoverKeys(g.coverPath)), ...iconKeys]

  // DB delete, in dependency order. DownloadLog → Game has no cascade, and
  // GameDlc cascades from Game, so we clear logs first, then games, then the
  // platform. Wrapped in a transaction so a failure leaves nothing half-deleted.
  await db.$transaction([
    ...(gameIds.length
      ? [
          db.downloadLog.deleteMany({ where: { gameId: { in: gameIds } } }),
          db.game.deleteMany({ where: { platformId: id } }),
        ]
      : []),
    db.platform.delete({ where: { id } }),
  ])

  // Covers: batch-delete the keys we already know about, plus a safety sweep of
  // anything left under covers/<slug>/ (e.g. orphans from earlier deletions).
  let allKeys = coverKeys
  try {
    const swept = await listS3Keys(`${COVERS_PREFIX}/${platform.slug}/`)
    allKeys = [...coverKeys, ...swept]
  } catch { /* listing is best-effort */ }

  const coversDeleted = await deleteManyFromS3(allKeys).catch(() => 0)

  return { platform: platform.name, games: gameIds.length, coversDeleted }
}

/**
 * Remove cover objects in MinIO that no longer belong to any game.
 *
 * Lists every key under covers/, builds the set of keys still referenced by a
 * game (display + original variants), and batch-deletes the difference.
 */
export async function cleanOrphanCovers(): Promise<{
  scanned: number
  referenced: number
  deleted: number
}> {
  // Ensure S3 is configured; if not, bail out gracefully.
  const cfg = await getS3Config()
  if (!cfg.accessKey || !cfg.secretKey) {
    return { scanned: 0, referenced: 0, deleted: 0 }
  }

  const stored = await listS3Keys(`${COVERS_PREFIX}/`)
  if (stored.length === 0) return { scanned: 0, referenced: 0, deleted: 0 }

  const games = await db.game.findMany({
    where: { coverPath: { not: null } },
    select: { coverPath: true },
  })
  const referenced = new Set<string>()
  for (const g of games) for (const k of gameCoverKeys(g.coverPath)) referenced.add(k)

  const orphans = stored.filter(k => !referenced.has(k))
  const deleted = orphans.length ? await deleteManyFromS3(orphans) : 0

  return { scanned: stored.length, referenced: referenced.size, deleted }
}

/**
 * Rename a platform's slug, migrating its covers in MinIO so existing art is
 * preserved (per the user's choice). Steps:
 *   1. validate the new slug is well-formed and unused,
 *   2. copy each cover object covers/<old>/* → covers/<new>/* and repoint
 *      Game.coverPath,
 *   3. update the slug,
 *   4. move the launchbox_platform_map entry to the new slug,
 *   5. delete the old cover objects.
 */
export async function renamePlatformSlug(id: number, rawNewSlug: string): Promise<{
  oldSlug: string
  newSlug: string
  coversMigrated: number
}> {
  const newSlug = rawNewSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
  if (!newSlug) throw new Error('Invalid slug')

  const platform = await db.platform.findUnique({ where: { id }, select: { slug: true, iconPath: true } })
  if (!platform) throw new Error('Platform not found')
  const oldSlug = platform.slug
  if (oldSlug === newSlug) return { oldSlug, newSlug, coversMigrated: 0 }

  const clash = await db.platform.findUnique({ where: { slug: newSlug }, select: { id: true } })
  if (clash) throw new Error(`Slug "${newSlug}" is already in use`)

  // Migrate covers: copy each object to the new prefix and repoint the DB.
  const games = await db.game.findMany({
    where: { platformId: id, coverPath: { not: null } },
    select: { id: true, coverPath: true },
  })

  const oldKeysToDelete: string[] = []
  let coversMigrated = 0
  for (const g of games) {
    if (!g.coverPath) continue
    const newCoverPath = g.coverPath.replace(
      `${COVERS_PREFIX}/${oldSlug}/`,
      `${COVERS_PREFIX}/${newSlug}/`,
    )
    if (newCoverPath === g.coverPath) continue // key didn't include the slug

    for (const oldKey of gameCoverKeys(g.coverPath)) {
      const newKey = oldKey.replace(`${COVERS_PREFIX}/${oldSlug}/`, `${COVERS_PREFIX}/${newSlug}/`)
      await copyS3Object(oldKey, newKey)
      oldKeysToDelete.push(oldKey)
    }
    await db.game.update({ where: { id: g.id }, data: { coverPath: newCoverPath } })
    coversMigrated++
  }

  // Migrate the platform icon (key is icons/<slug>.webp, always slug-keyed).
  let newIconPath: string | undefined
  if (platform.iconPath) {
    const oldIconKey = `icons/${oldSlug}.webp`
    const newIconKey = `icons/${newSlug}.webp`
    await copyS3Object(oldIconKey, newIconKey)
    oldKeysToDelete.push(oldIconKey)
    // Preserve any ?v= cache-buster on the stored path.
    newIconPath = platform.iconPath.replace(oldIconKey, newIconKey)
  }

  // Update the slug itself (+ repoint the icon path if migrated).
  await db.platform.update({
    where: { id },
    data: { slug: newSlug, ...(newIconPath ? { iconPath: newIconPath } : {}) },
  })

  // Move the LaunchBox platform-name override, if one was set for the old slug.
  try {
    const row = await db.setting.findUnique({ where: { key: 'launchbox_platform_map' } })
    if (row?.value) {
      const map = JSON.parse(row.value) as Record<string, string>
      if (map[oldSlug] != null) {
        map[newSlug] = map[oldSlug]
        delete map[oldSlug]
        await db.setting.update({ where: { key: 'launchbox_platform_map' }, data: { value: JSON.stringify(map) } })
      }
    }
  } catch { /* non-fatal */ }

  // Drop the now-duplicated old cover objects.
  if (oldKeysToDelete.length) await deleteManyFromS3(oldKeysToDelete).catch(() => {})

  return { oldSlug, newSlug, coversMigrated }
}
