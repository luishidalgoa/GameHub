import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { formatBytes } from '@/lib/utils'
import { ScanPanel } from '@/components/admin/ScanPanel'
import { MetadataBatchPanel } from '@/components/admin/MetadataBatchPanel'
import { Gamepad2, Monitor, HardDrive, ImageOff, FileQuestion } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const [t, totalGames, totalPlatforms, noCover, noMeta, scanLogs] = await Promise.all([
    getTranslations('Admin'),
    db.game.count({ where: { isHidden: false } }),
    db.platform.count({ where: { enabled: true } }),
    db.game.count({ where: { isHidden: false, coverPath: null, coverUrl: null } }),
    db.game.count({ where: { isHidden: false, metadataFetchedAt: null } }),
    db.scanLog.findMany({ orderBy: { startedAt: 'desc' }, take: 5 }),
  ])

  const sizeResult = await db.game.aggregate({
    _sum: { fileSize: true },
    where: { isHidden: false },
  })
  const totalSize = sizeResult._sum.fileSize ?? BigInt(0)

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Gamepad2 className="w-5 h-5" />} label={t('totalGames')}     value={totalGames.toString()} />
        <StatCard icon={<Monitor className="w-5 h-5" />}  label={t('platforms')}      value={totalPlatforms.toString()} />
        <StatCard icon={<HardDrive className="w-5 h-5" />} label={t('totalSize')}     value={formatBytes(totalSize)} />
        <StatCard icon={<ImageOff className="w-5 h-5" />} label={t('missingCovers')}  value={noCover.toString()} color="text-amber-400" />
        <StatCard icon={<FileQuestion className="w-5 h-5" />} label={t('noMetadata')} value={noMeta.toString()} color={noMeta > 0 ? 'text-violet-400' : 'text-foreground'} />
      </div>

      {/* Scan panel */}
      <ScanPanel />

      {/* Auto metadata batch */}
      <MetadataBatchPanel />

      {/* Recent scan logs */}
      {scanLogs.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="font-semibold mb-4">{t('recentScans')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-2 pr-4 font-medium">{t('date')}</th>
                  <th className="pb-2 pr-4 font-medium">{t('duration')}</th>
                  <th className="pb-2 pr-4 font-medium">{t('found')}</th>
                  <th className="pb-2 pr-4 font-medium text-green-500">{t('added')}</th>
                  <th className="pb-2 pr-4 font-medium text-blue-500">{t('updated')}</th>
                  <th className="pb-2 font-medium text-amber-500">{t('stale')}</th>
                </tr>
              </thead>
              <tbody>
                {scanLogs.map((log) => {
                  const duration = log.finishedAt
                    ? `${Math.round((log.finishedAt.getTime() - log.startedAt.getTime()) / 1000)}s`
                    : '—'
                  return (
                    <tr key={log.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground">
                        {log.startedAt.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{duration}</td>
                      <td className="py-2 pr-4">{log.gamesFound}</td>
                      <td className="py-2 pr-4 text-green-500">{log.gamesAdded}</td>
                      <td className="py-2 pr-4 text-blue-500">{log.gamesUpdated}</td>
                      <td className="py-2 text-amber-500">{log.gamesStale}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  color = 'text-foreground',
}: {
  icon: React.ReactNode
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  )
}
