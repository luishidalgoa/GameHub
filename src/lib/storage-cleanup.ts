import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { db } from '@/lib/db'
import { getS3Config, makeS3Client, deleteManyFromS3 } from '@/lib/s3'

/**
 * Keeps the bucket to what the database still points at.
 *
 *  1. Libretro snapshots (`…-tile.webp`) are low-resolution fallbacks that the
 *     home no longer shows. Their pointers are cleared first, so they become orphans.
 *  2. Every object that no row references is an orphan (a re-extracted image that
 *     replaced its pointer, an upload cut short by a restart, a removed platform icon).
 *     Orphans are deleted, except those younger than `minAgeHours`: an upload in
 *     progress has no row yet, and must not be mistaken for garbage.
 *
 * Every reference the app stores is counted: Game art and cover fields, the
 * repository (GameImage), platform icons, publisher art, and the `.original`
 * sibling the cover crop tool keeps beside each cover.
 */

const isLibretroKey = (k: string | null) => !!k && k.includes('-tile.webp')
const bare = (k: string | null | undefined) => {
  if (!k) return null
  const key = k.split('?')[0].replace(/^\/+/, '')
  return key && !key.startsWith('http') ? key : null
}

/** Every bucket key the database refers to. */
export async function referencedKeys(): Promise<Set<string>> {
  const refs = new Set<string>()
  const add = (k: string | null | undefined) => { const b = bare(k); if (b) refs.add(b) }

  const games = await db.game.findMany({
    select: { coverPath: true, backdropPath: true, tilePath: true, logoPath: true },
  })
  for (const g of games) { add(g.coverPath); add(g.backdropPath); add(g.tilePath); add(g.logoPath) }
  for (const k of [...refs]) {
    if (k.startsWith('covers/') && k.endsWith('.webp') && !k.endsWith('.original.webp')) {
      refs.add(k.slice(0, -5) + '.original.webp')
    }
  }

  for (const p of await db.platform.findMany({ select: { iconPath: true } })) add(p.iconPath)
  for (const i of await db.gameImage.findMany({ select: { s3Key: true } })) add(i.s3Key)

  const art = await db.setting.findUnique({ where: { key: 'publisher_art' } })
  if (art?.value) {
    try {
      for (const entry of Object.values(JSON.parse(art.value) as Record<string, { logo?: string; character?: string }>)) {
        add(entry.logo); add(entry.character)
      }
    } catch { /* a malformed setting refers to nothing */ }
  }
  return refs
}

/** Every object in the bucket with its size and date. Throws on failure: a half listing must not drive deletes. */
export async function listObjects(): Promise<{ key: string; size: number; modified: number }[]> {
  const cfg = await getS3Config()
  const client = makeS3Client(cfg)
  const out: { key: string; size: number; modified: number }[] = []
  let token: string | undefined
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: cfg.bucketName, ContinuationToken: token }))
    for (const o of res.Contents ?? []) {
      if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, modified: o.LastModified?.getTime() ?? 0 })
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
  return out
}

/** Clears the pointers at libretro snapshots, so the next step sees them as orphans. */
export async function clearLibretroPointers(): Promise<number> {
  const tiles = await db.game.updateMany({ where: { tilePath: { contains: '-tile.webp' } }, data: { tilePath: null } })
  const backs = await db.game.updateMany({
    where: { backdropPath: { contains: '-tile.webp' } },
    data: { backdropPath: null, backdropKind: null },
  })
  return tiles.count + backs.count
}

export interface CleanupReport {
  dryRun: boolean
  pointersCleared: number
  objects: number
  referenced: number
  orphans: number
  orphanMB: number
  deleted: number
  sample: string[]
}

export async function cleanupStorage(opts: { dryRun: boolean; minAgeHours?: number }): Promise<CleanupReport> {
  const pointersCleared = opts.dryRun ? 0 : await clearLibretroPointers()
  const refs = await referencedKeys()
  const objects = await listObjects()
  const cutoff = Date.now() - (opts.minAgeHours ?? 6) * 3600_000
  const orphans = objects.filter(o => !refs.has(o.key) && o.modified < cutoff)
  const bytes = orphans.reduce((n, o) => n + o.size, 0)
  const deleted = opts.dryRun ? 0 : await deleteManyFromS3(orphans.map(o => o.key))
  return {
    dryRun: opts.dryRun,
    pointersCleared,
    objects: objects.length,
    referenced: refs.size,
    orphans: orphans.length,
    orphanMB: Math.round(bytes / 1e5) / 10,
    deleted,
    sample: orphans.slice(0, 15).map(o => o.key),
  }
}
