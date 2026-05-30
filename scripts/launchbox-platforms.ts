/* eslint-disable no-console */
// Re-scan LaunchBox: cache its FULL platform catalog and auto-map your platforms.
//
//   npm run launchbox:platforms
//
// What it does:
//   1. Fetches the CANONICAL, COMPLETE LaunchBox platform catalog (~189) and
//      stores it in the `launchbox_platforms` setting. This is the source of
//      truth: ANY platform LaunchBox supports can now be resolved at runtime
//      (getLaunchBoxPlatformName matches your platform name against this list),
//      not just a hardcoded few. Re-run this whenever LaunchBox adds/renames
//      platforms.
//   2. Reads your GameHub platforms and writes a convenience override map
//      (`launchbox_platform_map`, slug → LaunchBox name) so your specific
//      consoles are pinned. Resolution order per slug:
//        a) existing manual override in `launchbox_platform_map`
//        b) the built-in alias map (by slug)        — LAUNCHBOX_PLATFORM_NAMES
//        c) exact name match against the catalog (case-insensitive)
//        d) fuzzy token-overlap best guess
//   3. Reports each platform with HOW it matched, so you can fix any in
//      Admin → Settings. (Even platforms NOT in the map still resolve via the
//      catalog at runtime.)
import { db as prisma } from '../src/lib/db'
import {
  fetchLaunchBoxPlatforms,
  LAUNCHBOX_PLATFORM_NAMES,
  clearLaunchBoxCatalogCache,
} from '../src/lib/metadata/launchbox'

type Live = { id: number; name: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const tokens = (s: string) => new Set(norm(s).split(' ').filter(Boolean))

/** Token-overlap score (Jaccard-ish), 0..1. */
function score(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  const inter = [...ta].filter(t => tb.has(t)).length
  return inter / Math.max(ta.size, tb.size)
}

function bestFuzzy(name: string, live: Live[]): { live: Live; score: number } | null {
  let best: { live: Live; score: number } | null = null
  for (const l of live) {
    const s = score(name, l.name)
    if (!best || s > best.score) best = { live: l, score: s }
  }
  return best
}

async function main() {
  console.log('Fetching LaunchBox platform list…')
  const live = await fetchLaunchBoxPlatforms()
  if (live.length === 0) {
    console.error('No platforms parsed — the site markup may have changed, or the request was blocked.')
    process.exit(1)
  }
  console.log(`Found ${live.length} platforms on LaunchBox — caching the full catalog.`)

  await prisma.setting.upsert({
    where:  { key: 'launchbox_platforms' },
    create: { key: 'launchbox_platforms', value: JSON.stringify(live) },
    update: { value: JSON.stringify(live) },
  })
  clearLaunchBoxCatalogCache()  // drop the in-memory cache so runtime re-reads the fresh list

  const liveByName = new Map(live.map(l => [l.name.toLowerCase(), l.name]))
  const existing = await prisma.setting.findUnique({ where: { key: 'launchbox_platform_map' } })
  const overrides: Record<string, string> = existing?.value ? JSON.parse(existing.value) : {}

  const platforms = await prisma.platform.findMany({
    select: { slug: true, name: true },
    orderBy: { sortOrder: 'asc' },
  })

  if (platforms.length === 0) {
    console.warn('No GameHub platforms in the DB yet — run the seed/scan first.')
  }

  const map: Record<string, string> = {}
  const rows: { slug: string; chosen: string | null; how: string }[] = []

  for (const p of platforms) {
    let chosen: string | null = null
    let how = ''

    // a) manual override (only if it still exists live)
    const ov = overrides[p.slug]
    if (ov && liveByName.has(ov.toLowerCase())) { chosen = liveByName.get(ov.toLowerCase())!; how = 'override' }

    // b) seed map by slug (only if valid live)
    if (!chosen) {
      const seed = LAUNCHBOX_PLATFORM_NAMES[p.slug]
      if (seed && liveByName.has(seed.toLowerCase())) { chosen = liveByName.get(seed.toLowerCase())!; how = 'seed' }
    }

    // c) exact name match (GameHub platform name == a live name)
    if (!chosen && liveByName.has(p.name.toLowerCase())) { chosen = liveByName.get(p.name.toLowerCase())!; how = 'exact-name' }

    // d) fuzzy best guess
    if (!chosen) {
      const f = bestFuzzy(p.name, live)
      if (f && f.score >= 0.5) { chosen = f.live.name; how = `fuzzy(${f.score.toFixed(2)})` }
      else if (f && f.score > 0) { how = `unsure → closest "${f.live.name}" (${f.score.toFixed(2)})` }
      else how = 'no match'
    }

    if (chosen) map[p.slug] = chosen
    rows.push({ slug: p.slug, chosen, how })
  }

  // Keep any prior overrides for slugs not currently present (don't lose manual work).
  for (const [slug, name] of Object.entries(overrides)) {
    if (!(slug in map) && liveByName.has(name.toLowerCase())) map[slug] = liveByName.get(name.toLowerCase())!
  }

  await prisma.setting.upsert({
    where:  { key: 'launchbox_platform_map' },
    create: { key: 'launchbox_platform_map', value: JSON.stringify(map) },
    update: { value: JSON.stringify(map) },
  })

  console.log('\nYour GameHub platforms → LaunchBox:')
  let needAttention = 0
  for (const r of rows) {
    if (r.chosen) {
      console.log(`  ✓ ${r.slug.padEnd(14)} → "${r.chosen}"   [${r.how}]`)
    } else {
      needAttention++
      console.log(`  ! ${r.slug.padEnd(14)} → (sin asignar)   ${r.how}`)
    }
  }

  console.log(`\nCatalog: ${live.length} LaunchBox platforms cached (all resolvable at runtime).`)
  console.log(`Pinned ${Object.keys(map).length} of your platform(s) in the override map. ${needAttention} need manual attention.`)
  if (needAttention > 0) {
    console.log('Fix them in Admin → Settings (or edit the "launchbox_platform_map" setting):')
    console.log('  set the slug to the exact LaunchBox platform name from the list above.')
  }
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
