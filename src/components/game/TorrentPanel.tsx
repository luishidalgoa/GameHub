'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

/** Magnet y ficha de la fuente de un juego que solo existe como torrent. */
export function TorrentPanel({ magnet, sourceUrl }: { magnet: string; sourceUrl: string }) {
  const t = useTranslations('GameGrid')
  const [copied, setCopied] = useState(false)

  async function copyMagnet() {
    try {
      await navigator.clipboard.writeText(magnet)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={copyMagnet}
        className="px-3 py-1.5 text-sm rounded-md bg-sky-600/20 border border-sky-600/40 text-sky-300 hover:bg-sky-600/30 transition-colors"
      >
        {copied ? t('copied') : t('copyMagnet')}
      </button>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        {t('source')}
      </a>
    </div>
  )
}
