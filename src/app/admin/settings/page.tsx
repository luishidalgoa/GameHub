import { db } from '@/lib/db'
import { SettingsForm } from '@/components/admin/SettingsForm'
import { DonationSettingsForm } from '@/components/admin/DonationSettingsForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [platforms, settings] = await Promise.all([
    db.platform.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.setting.findMany(),
  ])

  const settingsMap: Record<string, string> = {}
  settings.forEach((s) => { settingsMap[s.key] = s.value })

  return (
    <div className="space-y-8">
      <SettingsForm platforms={platforms} settings={settingsMap} />

      <DonationSettingsForm
        initial={{
          donate_kofi:    settingsMap['donate_kofi']    ?? '',
          donate_paypal:  settingsMap['donate_paypal']  ?? '',
          donate_bmac:    settingsMap['donate_bmac']    ?? '',
          donate_crypto:  settingsMap['donate_crypto']  ?? '',
          donate_message: settingsMap['donate_message'] ?? '',
        }}
      />
    </div>
  )
}
