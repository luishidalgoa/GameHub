import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { Heart, Coffee, Bitcoin, ExternalLink } from 'lucide-react'
import { CopyButton } from '@/components/shared/CopyButton'
import { goalProgress, parseGoal, quarterOf } from '@/lib/donations/goal'

export const dynamic = 'force-dynamic'

const KEYS = ['donate_kofi', 'donate_bmac', 'donate_crypto', 'donate_message', 'donate_quarter_goal_eur']

export default async function DonatePage() {
  const now = new Date()
  const quarter = quarterOf(now)

  const [t, rows, raisedAgg] = await Promise.all([
    getTranslations('Donate'),
    db.setting.findMany({ where: { key: { in: KEYS } } }),
    db.donation.aggregate({
      _sum: { amount: true },
      where: { currency: 'EUR', receivedAt: { gte: quarter.start, lt: quarter.end } },
    }),
  ])
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]))

  const kofi    = s['donate_kofi']    ?? ''
  const bmac    = s['donate_bmac']    ?? ''
  const crypto  = s['donate_crypto']  ?? ''
  const message = s['donate_message'] ?? ''
  const goal    = parseGoal(s['donate_quarter_goal_eur'])

  const any = kofi || bmac || crypto

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

      {goal !== null && (
        <QuarterGoal label={quarter.label} goal={goal} raised={raisedAgg._sum.amount ?? 0} />
      )}

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

/**
 * Progress toward the quarter's goal. Below the goal, one green bar. Past it, the
 * bar is full in green and a violet layer on top shows the excess, so an
 * overshoot is visible at a glance.
 */
function QuarterGoal({ label, goal, raised }: { label: string; goal: number; raised: number }) {
  const p = goalProgress(raised, goal)
  const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  const over = p.percent > 100

  return (
    <section aria-label={`Objetivo ${label}`} className="mb-10 rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Objetivo {label}</h2>
        <span className="text-sm tabular-nums text-muted-foreground">
          {money.format(p.raised)} de {money.format(p.goal)}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(p.percent, 100)}
        className="relative h-3 w-full overflow-hidden rounded-full bg-secondary"
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${p.firstLayer}%` }} />
        {p.secondLayer > 0 && (
          <div className="absolute inset-y-0 left-0 rounded-full bg-violet-500" style={{ width: `${p.secondLayer}%` }} />
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {over ? (
          <>¡Objetivo superado! <span className="font-semibold text-violet-400">{p.percent} %</span></>
        ) : (
          <><span className="font-semibold text-emerald-400">{p.percent} %</span> conseguido</>
        )}
        <span className="opacity-70"> · solo donaciones en euros del trimestre en curso</span>
      </p>
    </section>
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
