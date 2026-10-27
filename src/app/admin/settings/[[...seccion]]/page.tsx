import { db } from '@/lib/db'
import { SettingsForm } from '@/components/admin/SettingsForm'
import { parsePlatformFamilies } from '@/lib/platform-family'
import { getOrientations } from '@/lib/console-orientation'
import { chainFor } from '@/lib/metadata/chain-view'
import { parseGlobal, snapshotFor } from '@/lib/metadata/chains'

export const dynamic = 'force-dynamic'

export default async function SettingsPage({ params }: { params: { seccion?: string[] } }) {
  // The section lives in the URL: /admin/settings/<seccion>.
  const initialSection = params.seccion?.[0] ?? ''
  const [platforms, settings, support, orientations] = await Promise.all([
    db.platform.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { games: true } } },
    }),
    db.setting.findMany(),
    db.onlineSupport.groupBy({ by: ['provider'], _count: { _all: true }, _max: { syncedAt: true } }),
    getOrientations(),
  ])
  const onlineStatus = Object.fromEntries(support.map((s) => [
    s.provider,
    { count: s._count._all, syncedAt: s._max.syncedAt ? s._max.syncedAt.toISOString() : null },
  ]))

  const settingsMap: Record<string, string> = {}
  settings.forEach((s) => { settingsMap[s.key] = s.value })

  // The pipeline of each active platform, as the batch runs it (read-only panel).
  const metadataChains = platforms.filter((p) => p.enabled).map((p) => chainFor({ slug: p.slug, name: p.name }))

  // The chains of sources: the global default, and each active platform's own and effective chains.
  const globalChains = parseGlobal(settingsMap['provider_chains'], {
    cover: settingsMap['provider_cover'], info: settingsMap['provider_info'],
    description: settingsMap['provider_description'], screenshots: settingsMap['provider_screenshots'],
  })
  const providerChains = {
    global: globalChains,
    platforms: platforms.filter((p) => p.enabled).map((p) => ({
      slug: p.slug,
      name: p.name,
      ...snapshotFor(globalChains, p),
    })),
  }

  return (
    <SettingsForm
      initialSection={initialSection}
      platforms={platforms}
      metadataChains={metadataChains}
      providerChains={providerChains}
      orientations={orientations}
      families={parsePlatformFamilies(settingsMap['platform_families'])}
      onlineStatus={onlineStatus}
      settings={settingsMap}
      donation={{
        donate_kofi:             settingsMap['donate_kofi']             ?? '',
        donate_bmac:             settingsMap['donate_bmac']             ?? '',
        donate_crypto:           settingsMap['donate_crypto']           ?? '',
        donate_message:          settingsMap['donate_message']          ?? '',
        donate_quarter_goal_eur: settingsMap['donate_quarter_goal_eur'] ?? '',
      }}
    />
  )
}
