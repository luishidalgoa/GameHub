'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Search } from 'lucide-react'

interface Props {
  gameId: number
  value: string
  inputClassName: string
  /**
   * Called with the new value. Typed values come with 'manual'; a value found by
   * "Buscar nota" comes with the provider that produced it.
   */
  onChange: (value: string, source: string | null) => void
}

/** Nota 0–100 con «Buscar nota». Lo usan la ficha completa y el panel. */
export function ScoreField({ gameId, value, inputClassName, onChange }: Props) {
  const t = useTranslations('GameEditor')
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState('')

  const search = async () => {
    setSearching(true)
    setMessage('')
    try {
      const res = await fetch(`/api/metadata/${gameId}/score`, { method: 'POST' })
      const data = await res.json()
      if (res.ok && typeof data.score === 'number') {
        onChange(String(data.score), data.source ?? null)
        setMessage(t('scoreFound', { score: data.score }))
      } else {
        setMessage(t('scoreNotFound'))
      }
    } catch {
      setMessage(t('scoreNotFound'))
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value, 'manual')}
          className={`${inputClassName} w-24`}
          type="number"
          min="0"
          max="100"
          placeholder="0–100"
        />
        <button
          type="button"
          onClick={search}
          disabled={searching}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-secondary px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {t('searchScore')}
        </button>
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
      </div>
      <p className="text-xs text-muted-foreground">{t('fieldScoreHint')}</p>
    </div>
  )
}
