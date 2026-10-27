import { db } from '@/lib/db'
import { SettingsForm } from '@/components/admin/SettingsForm'
import { parsePlatformFamilies } from '@/lib/platform-family'
import { getOrientations } from '@/lib/console-orientation'
import { getProviderMatrix } from '@/lib/metadata/matrix'
import { chainFor } from '@/lib/metadata/chain-view'

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

  // The metadata chain as the batch will run it, per active platform (read-only panel).
  const metadataChains = await Promise.all(
    platforms.filter((p) => p.enabled).map(async (p) => chainFor({
      slug:   p.slug,
      name:   p.name,
      matrix: await getProviderMatrix(p.slug),
    })),
  )

  return (
    <SettingsForm
      initialSection={initialSection}
      platforms={platforms}
      metadataChains={metadataChains}
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
