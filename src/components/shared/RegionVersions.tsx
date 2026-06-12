import { regionFlag } from '@/lib/rom-tags'
import { DownloadButton } from './DownloadButton'
import { LanguageBadges } from './LanguageBadges'

export interface RegionEdition {
  /** undefined → the canonical/primary game file; otherwise a region GameDlc id. */
  dlcId?: number
  region: string | null
  languages: string | null
  fileSize: string
}

/**
 * Region selector for a unified game card. Each region is a one-click download
 * (reusing {@link DownloadButton}, so the primary uses gameId and every other
 * region its GameDlc id) with its languages shown alongside. Renders nothing
 * unless there are at least two editions, so single-region games are unaffected.
 */
export function RegionVersions({
  gameId,
  editions,
  title,
}: {
  gameId: number
  editions: RegionEdition[]
  title: string
}) {
  if (editions.length < 2) return null

  return (
    <div className="mb-6">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {editions.map((e, i) => {
          const flag  = regionFlag(e.region)
          const label = `${flag ? flag + ' ' : ''}${e.region ?? '—'}`
          return (
            <div
              key={e.dlcId ?? `primary-${i}`}
              className="flex items-center gap-2 bg-secondary/40 border border-border rounded-lg pl-1 pr-2 py-1"
            >
              <DownloadButton gameId={gameId} dlcId={e.dlcId} label={label} fileSize={e.fileSize} variant="secondary" />
              <LanguageBadges languages={e.languages} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
