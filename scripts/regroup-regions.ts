/**
 * One-off migration: backfill region/languages/groupKey from existing file
 * names and unify region duplicates into one card per game.
 *
 * Usage:
 *   npm run regroup:regions                      # DRY-RUN — reports only, no writes
 *   npm run regroup:regions -- --apply           # backfill + consolidate (writes)
 *   npm run regroup:regions -- --platform=nds    # restrict to one platform slug
 *
 * Reliability: run `npm run db:export` first to back up the database. The grouping
 * is reversible-by-rescan and never deletes files on disk — it only reorganises
 * rows (the absorbed ROMs become downloadable `type='region'` editions).
 */
import { PrismaClient } from '@prisma/client'

// Override the db singleton for this standalone script (same trick as scan.ts).
;(global as { prisma?: PrismaClient }).prisma = new PrismaClient()

import { db } from '../src/lib/db'
import { parseRomTags, languagesToCsv, gameGroupKey } from '../src/lib/rom-tags'
import { consolidateRegionGroup, choosePrimary } from '../src/lib/scanner/regions'

const apply       = process.argv.includes('--apply')
const platformArg = (process.argv.find((a) => a.startsWith('--platform=')) ?? '').split('=')[1]

async function main() {
  console.log(apply ? '▶ APPLY mode — writing changes\n' : '▶ DRY-RUN — no changes will be written (pass --apply to commit)\n')

  const platforms = await db.platform.findMany({
    where:   platformArg ? { slug: platformArg } : {},
    orderBy: { sortOrder: 'asc' },
  })
  if (platforms.length === 0) { console.log('No platforms found.'); return }

  let totalBackfilled = 0
  let totalGroups = 0
  let totalMerged = 0

  for (const platform of platforms) {
    const games = await db.game.findMany({
      where:  { platformId: platform.id },
      select: { id: true, filePath: true, fileName: true, fileSize: true, region: true, languages: true, groupKey: true },
    })
    if (games.length === 0) continue

    // ── Phase A: recompute region/languages/groupKey from the file name ──────────
    let backfilled = 0
    for (const g of games) {
      const tags    = parseRomTags(g.fileName)
      const region  = tags.region
      const langs   = languagesToCsv(tags.languages)
      const key     = gameGroupKey(g.fileName)
      const changed = region !== g.region || langs !== g.languages || key !== g.groupKey
      if (!changed) continue
      backfilled++
      if (apply) {
        await db.game.update({ where: { id: g.id }, data: { region, languages: langs, groupKey: key } })
      }
      // Keep the in-memory copy current so Phase B reports the post-backfill state.
      g.region = region; g.languages = langs; g.groupKey = key
    }
    totalBackfilled += backfilled

    // ── Phase B: group by groupKey and report/consolidate duplicates ─────────────
    const byKey = new Map<string, typeof games>()
    for (const g of games) {
      if (!g.groupKey) continue
      const arr = byKey.get(g.groupKey)
      if (arr) arr.push(g); else byKey.set(g.groupKey, [g])
    }
    const dupeGroups = [...byKey.entries()].filter(([, arr]) => arr.length > 1)

    if (backfilled > 0 || dupeGroups.length > 0) {
      console.log(`■ ${platform.name} (${platform.slug}) — ${games.length} games, backfill ${backfilled}, duplicate groups ${dupeGroups.length}`)
    }
    for (const [key, arr] of dupeGroups) {
      const primary = choosePrimary(arr)
      const others  = arr.filter((g) => g.id !== primary.id)
      console.log(`   • ${key.replace(/^name:/, '')}: primary = [${primary.region ?? '—'}] ${primary.fileName}`)
      for (const o of others) console.log(`       + region edition [${o.region ?? '—'}] ${o.fileName}`)
      totalGroups++
      totalMerged += others.length
    }

    if (apply && dupeGroups.length > 0) {
      // Re-run through the single shared consolidation path so the live scanner
      // and this migration behave identically.
      for (const [key] of dupeGroups) await consolidateRegionGroup(platform.id, key)
    }
  }

  console.log('\n── Summary ─────────────────────────────')
  console.log(`Backfilled rows : ${totalBackfilled}`)
  console.log(`Duplicate groups: ${totalGroups}`)
  console.log(`Rows folded in  : ${totalMerged}`)
  console.log(apply ? '✔ Applied.' : 'ℹ Dry-run only. Re-run with --apply (after db:export) to commit.')
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
