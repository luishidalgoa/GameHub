import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { Heart, Coffee, Bitcoin, ExternalLink } from 'lucide-react'
import { CopyButton } from '@/components/shared/CopyButton'

export const dynamic = 'force-dynamic'

const KEYS = ['donate_kofi', 'donate_paypal', 'donate_bmac', 'donate_crypto', 'donate_message']

export default async function DonatePage() {
  const [t, rows] = await Promise.all([
    getTranslations('Donate'),
    db.setting.findMany({ where: { key: { in: KEYS } } }),
  ])
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]))

  const kofi    = s['donate_kofi']    ?? ''
  const paypal  = s['donate_paypal']  ?? ''
  const bmac    = s['donate_bmac']    ?? ''
  const crypto  = s['donate_crypto']  ?? ''
  const message = s['donate_message'] ?? ''

  const any = kofi || paypal || bmac || crypto

  return (
    <div className="max-w-lg mx-auto py-16 px-4">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 mb-4">
          <Heart className="w-6 h-6 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">{t('title')}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {message || t('defaultMessage')}
        </p>
      </div>

      {any ? (
        <div className="space-y-3">
          {kofi && (
            <DonateLink
              href={kofi}
              icon={<Coffee className="w-4 h-4" />}
              label="Ko-fi"
              color="text-cyan-400"
              bg="hover:bg-cyan-500/10 border-cyan-500/20"
            />
          )}
          {paypal && (
            <DonateLink
              href={paypal}
              icon={<span className="text-sm font-bold text-blue-400">PP</span>}
              label="PayPal"
              color="text-blue-400"
              bg="hover:bg-blue-500/10 border-blue-500/20"
            />
          )}
          {bmac && (
            <DonateLink
              href={bmac}
              icon={<Coffee className="w-4 h-4" />}
              label="Buy Me a Coffee"
              color="text-yellow-400"
              bg="hover:bg-yellow-500/10 border-yellow-500/20"
            />
          )}
          {crypto && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-orange-500/20 bg-card">
              <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-orange-500/10">
                <Bitcoin className="w-4 h-4 text-orange-400" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-orange-400">Crypto</p>
                <p className="text-xs font-mono text-muted-foreground truncate">{crypto}</p>
              </div>
              <CopyButton value={crypto} />
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground text-sm">
          {t('notConfigured')}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground mt-10 opacity-60">
        {t('footer')}
      </p>
    </div>
  )
}

function DonateLink({
  href, icon, label, color, bg,
}: {
  href: string; icon: React.ReactNode; label: string; color: string; bg: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border bg-card transition-colors ${bg}`}
    >
      <span className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-current/10 ${color}`}>
        {icon}
      </span>
      <span className={`flex-1 text-sm font-medium ${color}`}>{label}</span>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
    </a>
  )
}
