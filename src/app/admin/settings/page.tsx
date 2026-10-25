import { db } from '@/lib/db'
import { SettingsForm } from '@/components/admin/SettingsForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [platforms, settings, support] = await Promise.all([
    db.platform.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { games: true } } },
    }),
    db.setting.findMany(),
    db.onlineSupport.groupBy({ by: ['provider'], _count: { _all: true }, _max: { syncedAt: true } }),
  ])
  const onlineStatus = Object.fromEntries(support.map((s) => [
    s.provider,
    { count: s._count._all, syncedAt: s._max.syncedAt ? s._max.syncedAt.toISOString() : null },
  ]))

  const settingsMap: Record<string, string> = {}
  settings.forEach((s) => { settingsMap[s.key] = s.value })

  return (
    <SettingsForm
      platforms={platforms}
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
