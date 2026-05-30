/* eslint-disable no-console */
// Re-scan the LaunchBox platform list and refresh the slug→name mapping.
//
// Run after first install, or any time LaunchBox might have renamed a platform:
//   npm run launchbox:platforms
//
// It stores two DB settings:
//   launchbox_platforms     — JSON [{id,name}]   the full canonical list
//   launchbox_platform_map  — JSON {slug:name}   GameHub slug → LaunchBox name
//
// The map is seeded from the built-in defaults, merged with any existing custom
// entries, and each mapped name is validated against the fresh list so you get a
// warning if LaunchBox changed a name.
import { db as prisma } from '../src/lib/db'
import { fetchLaunchBoxPlatforms, LAUNCHBOX_PLATFORM_NAMES } from '../src/lib/metadata/launchbox'

async function main() {
  console.log('Fetching LaunchBox platform list…')
  const platforms = await fetchLaunchBoxPlatforms()
  if (platforms.length === 0) {
    console.error('No platforms parsed — the site markup may have changed, or the request was blocked.')
    process.exit(1)
  }
  console.log(`Found ${platforms.length} platforms on LaunchBox.`)

  // Persist the canonical list.
  await prisma.setting.upsert({
    where:  { key: 'launchbox_platforms' },
    create: { key: 'launchbox_platforms', value: JSON.stringify(platforms) },
    update: { value: JSON.stringify(platforms) },
  })

  // Build the slug→name map: defaults + any existing custom overrides.
  const existing = await prisma.setting.findUnique({ where: { key: 'launchbox_platform_map' } })
  const current: Record<string, string> = existing?.value ? JSON.parse(existing.value) : {}
  const merged: Record<string, string> = { ...LAUNCHBOX_PLATFORM_NAMES, ...current }

  // Validate every mapped name against the fresh list (case-insensitive).
  const liveNames = new Set(platforms.map(p => p.name.toLowerCase()))
  let warnings = 0
  for (const [slug, name] of Object.entries(merged)) {
    if (!liveNames.has(name.toLowerCase())) {
      warnings++
      // Suggest the closest live name by simple token overlap.
      const suggestion = platforms
        .map(p => ({ name: p.name, score: overlap(name, p.name) }))
        .sort((a, b) => b.score - a.score)[0]
      console.warn(
        `  ! "${slug}" → "${name}" not found on LaunchBox.` +
          (suggestion && suggestion.score > 0 ? `  Closest: "${suggestion.name}"` : ''),
      )
    }
  }

  await prisma.setting.upsert({
    where:  { key: 'launchbox_platform_map' },
    create: { key: 'launchbox_platform_map', value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  })

  console.log(`Saved. Mapping has ${Object.keys(merged).length} platforms, ${warnings} need attention.`)
  if (warnings > 0) {
    console.log('Edit "launchbox_platform_map" in Admin → Settings (or the DB) to fix any mismatches.')
  }
}

// crude token-overlap score for suggestions
function overlap(a: string, b: string): number {
  const t = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean))
  const sa = t(a), sb = t(b)
  return [...sa].filter(x => sb.has(x)).length
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
