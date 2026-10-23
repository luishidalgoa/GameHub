import { db } from '@/lib/db'
import { SettingsForm } from '@/components/admin/SettingsForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [platforms, settings] = await Promise.all([
    db.platform.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { games: true } } },
    }),
    db.setting.findMany(),
  ])

  const settingsMap: Record<string, string> = {}
  settings.forEach((s) => { settingsMap[s.key] = s.value })

  return (
    <SettingsForm
      platforms={platforms}
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
