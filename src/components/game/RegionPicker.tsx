'use client'

import { useState, type ReactNode } from 'react'
import { DownloadButton } from '@/components/shared/DownloadButton'
import { cn } from '@/lib/utils'
import type { Edition } from '@/lib/game-editions'

export interface PickerEdition extends Edition {
  /** Text of the download button for this edition, already translated. */
  downloadLabel: string
}

/**
 * Region badges for the game page. Picking one changes the edition the red
 * download button fetches; it never adds a button per region.
 */
export function RegionPicker({
  gameId,
  editions,
  initialKey,
  groupLabel,
  children,
}: {
  gameId: number
  editions: PickerEdition[]
  initialKey?: string
  groupLabel: string
  /** Extra actions shown after the download button. */
  children?: ReactNode
}) {
  const [key, setKey] = useState(initialKey)
  const selected = editions.find((e) => e.key === key) ?? editions[0]
  if (!selected) return null

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-2">
        {editions.map((e) => {
          const on = e.key === selected.key
          return (
            <button
              key={e.key}
              type="button"
              aria-pressed={on}
              onClick={() => setKey(e.key)}
              className={cn(
                'px-3.5 py-2 rounded-lg text-sm border transition-colors',
                on
                  ? 'bg-secondary border-primary/60 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60',
              )}
            >
              <span className="font-medium">{e.region ?? '—'}</span>
              {e.languages.length > 0 && (
                <span className="ml-2 text-[11px] uppercase tracking-wide opacity-70">{e.languages.join(' ')}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {BigInt(selected.fileSize) > BigInt(0) && (
          <DownloadButton
            gameId={gameId}
            dlcId={selected.dlcId}
            label={selected.downloadLabel}
            fileSize={selected.fileSize}
          />
        )}
        {children}
      </div>
    </div>
  )
}
