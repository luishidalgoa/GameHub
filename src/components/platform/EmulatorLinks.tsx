'use client'

import { useEffect, useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'

export interface EmulatorEntry { name?: string; url: string }
export type EmulatorOS = 'windows' | 'android' | 'ios'
export type EmulatorSet = Partial<Record<EmulatorOS, EmulatorEntry>>

export const OS_ORDER: EmulatorOS[] = ['windows', 'android', 'ios']
export const OS_LABEL: Record<EmulatorOS, string> = { windows: 'Windows', android: 'Android', ios: 'iOS' }

/** Parse the Platform.emulators JSON. The JSON is the single source of truth:
 *  if it's empty/unset, no emulator is shown (no implicit fallbacks). */
export function parseEmulators(raw: string | null | undefined): EmulatorSet {
  const set: EmulatorSet = {}
  if (raw) {
    try {
      const obj = JSON.parse(raw)
      for (const os of OS_ORDER) {
        const e = obj?.[os]
        if (e && typeof e.url === 'string' && e.url.trim()) {
          set[os] = { name: e.name ? String(e.name) : undefined, url: String(e.url) }
        }
      }
    } catch { /* ignore malformed JSON */ }
  }
  return set
}

function detectOS(): EmulatorOS | 'other' {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  if (/android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  // iPadOS in desktop mode reports as Macintosh + touch
  if (/Macintosh/i.test(ua) && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1) return 'ios'
  if (/Windows/i.test(ua)) return 'windows'
  return 'other'
}

interface Props {
  raw: string | null | undefined
  /** Base label, e.g. "Descargar emulador". */
  label: string
}

export function EmulatorLinks({ raw, label }: Props) {
  const emulators = parseEmulators(raw)
  const [os, setOs] = useState<EmulatorOS | 'other'>('other')
  useEffect(() => { setOs(detectOS()) }, [])

  const available = OS_ORDER.filter(o => emulators[o])
  if (available.length === 0) return null

  // Primary = the detected OS if configured; else Windows (desktop default); else first available.
  const primaryOs: EmulatorOS =
    os !== 'other' && emulators[os] ? os
    : emulators.windows ? 'windows'
    : available[0]
  const others = available.filter(o => o !== primaryOs)

  const primary = emulators[primaryOs]!

  return (
    <div className="flex flex-col items-start sm:items-end gap-1">
      <a
        href={primary.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-secondary border border-border hover:bg-accent text-sm font-medium transition-colors"
      >
        <Download className="w-4 h-4 text-primary" />
        {primary.name ? `${label}: ${primary.name}` : `${label} (${OS_LABEL[primaryOs]})`}
        <ExternalLink className="w-3 h-3 text-muted-foreground" />
      </a>

      {others.length > 0 && (
        <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap sm:justify-end">
          {others.map(o => (
            <a
              key={o}
              href={emulators[o]!.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {emulators[o]!.name ?? OS_LABEL[o]}
              <span className="text-muted-foreground/50">({OS_LABEL[o]})</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
