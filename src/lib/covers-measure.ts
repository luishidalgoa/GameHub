import sharp from 'sharp'
import { db } from '@/lib/db'
import { getFromS3, coverPathToKey } from '@/lib/s3'
import { getOriginalCoverPath } from '@/lib/covers'

// Measuring a cover reads its stored picture and keeps its size, so the quality pass can
// judge it. Nothing is asked of a provider: the picture is read from storage. A picture
// that cannot be read is kept as 0×0, so it counts as measured and never comes back.

const BATCH = 40

/** The size of a stored cover: its original when there is one, else the stored picture. Null when neither reads. */
async function sizeOf(coverPath: string): Promise<{ width: number; height: number } | null> {
  for (const path of [getOriginalCoverPath(coverPath), coverPath]) {
    const key = coverPathToKey(path)
    if (!key) continue
    try {
      const meta = await sharp(await getFromS3(key)).metadata()
      if (meta.width && meta.height) return { width: meta.width, height: meta.height }
    } catch { /* try the next picture */ }
  }
  return null
}

function pendingWhere(platformSlug?: string) {
  return {
    coverPath: { not: null },
    coverWidth: null,
    ...(platformSlug ? { platform: { slug: platformSlug } } : {}),
  }
}

/** How many covers still wait to be measured, for a platform or all of them. */
export async function unmeasuredCovers(platformSlug?: string): Promise<number> {
  return db.game.count({ where: pendingWhere(platformSlug) })
}

/**
 * Measures covers until the time budget is spent or none is left. Returns what this call did
 * and how many are still to measure.
 */
export async function measureCovers(opts: { platformSlug?: string; budgetMs: number }): Promise<{ measured: number; unreadable: number; remaining: number }> {
  const started = Date.now()
  let measured = 0
  let unreadable = 0
  while (Date.now() - started < opts.budgetMs) {
    const rows = await db.game.findMany({
      where: pendingWhere(opts.platformSlug),
      select: { id: true, coverPath: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    })
    if (rows.length === 0) break
    await Promise.all(rows.map(async row => {
      const size = row.coverPath ? await sizeOf(row.coverPath) : null
      await db.game.update({
        where: { id: row.id },
        data: { coverWidth: size?.width ?? 0, coverHeight: size?.height ?? 0 },
      })
      if (size) measured++
      else unreadable++
    }))
  }
  return { measured, unreadable, remaining: await unmeasuredCovers(opts.platformSlug) }
}
