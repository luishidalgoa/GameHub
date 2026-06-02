'use client'

import useSWR from 'swr'
import { useTranslations } from 'next-intl'
import { CheckCircle2, XCircle, Activity, Loader2 } from 'lucide-react'

interface Check { name: string; ok: boolean; detail?: string }
interface Health { status: string; checks: Check[]; time: string }

const fetcher = (url: string) => fetch(url).then(r => r.json())

const LABEL: Record<string, string> = { db: 'Base de datos', minio: 'MinIO', rawg: 'RAWG' }

/**
 * Live status of the core dependencies (DB, MinIO, RAWG), polled from
 * /api/health. Surfaces a failure on the dashboard before a visitor hits it.
 */
export function HealthPanel() {
  const t = useTranslations('Health')
  const { data, isLoading } = useSWR<Health>('/api/health', fetcher, { refreshInterval: 30_000 })

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          {t('title')}
        </h3>
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            data?.status === 'ok' ? 'bg-emerald-600/20 text-emerald-400' : 'bg-rose-600/20 text-rose-400'
          }`}>
            {data?.status === 'ok' ? t('healthy') : t('degraded')}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(data?.checks ?? []).map(c => (
          <div key={c.name} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
            {c.ok
              ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              : <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />}
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">{LABEL[c.name] ?? c.name}</p>
              {c.detail && <p className="text-[11px] text-muted-foreground truncate">{c.detail}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
