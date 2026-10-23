'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Search } from 'lucide-react'
import { SCORE_SOURCE_LABEL, type ScoreCandidate } from '@/lib/metadata/score-candidates'

interface Props {
  gameId: number
  /** Initial text of the manual search box. */
  gameTitle: string
  value: string
  inputClassName: string
  /**
   * Called with the new value. Typed values come with 'manual'; a value found by
   * a search comes with the source that produced it.
   */
  onChange: (value: string, source: string | null) => void
}

/**
 * Nota 0–100 con dos formas de buscarla: «Buscar nota» (la cadena automática, una
 * sola respuesta) y «Buscar a mano» (escribes el texto y eliges entre candidatos).
 * Lo usan la ficha completa y el panel.
 */
export function ScoreField({ gameId, gameTitle, value, inputClassName, onChange }: Props) {
  const t = useTranslations('GameEditor')
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState('')

  const [manualOpen, setManualOpen] = useState(false)
  const [query, setQuery] = useState(gameTitle)
  const [manualLoading, setManualLoading] = useState(false)
  const [candidates, setCandidates] = useState<ScoreCandidate[] | null>(null)
  const [manualError, setManualError] = useState('')

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

  const searchManual = async () => {
    const q = query.trim()
    if (!q) return
    setManualLoading(true)
    setManualError('')
    setCandidates(null)
    try {
      const res = await fetch(`/api/metadata/${gameId}/score?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (!res.ok) setManualError(data.error ?? 'Búsqueda fallida')
      else setCandidates(data.candidates ?? [])
    } catch {
      setManualError('Sin conexión con las fuentes de notas')
    } finally {
      setManualLoading(false)
    }
  }

  const pick = (c: ScoreCandidate) => {
    onChange(String(c.score), c.source)
    setMessage(`Nota ${c.score} desde ${SCORE_SOURCE_LABEL[c.source]}`)
    setManualOpen(false)
    setCandidates(null)
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
        <button
          type="button"
          onClick={() => { setManualOpen((open) => !open); setManualError('') }}
          aria-expanded={manualOpen}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-secondary px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Search className="h-4 w-4" />
          Buscar a mano
        </button>
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
      </div>

      {manualOpen && (
        <div className="space-y-2 rounded-md border border-border bg-card p-3">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchManual() } }}
              placeholder="Título del juego"
              className={`${inputClassName} flex-1`}
              autoFocus
            />
            <button
              type="button"
              onClick={searchManual}
              disabled={manualLoading || !query.trim()}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {manualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </button>
          </div>

          {manualError && <p className="text-xs text-destructive">{manualError}</p>}

          {candidates && candidates.length === 0 && (
            <p className="text-xs text-muted-foreground">Ninguna fuente tiene nota para «{query.trim()}».</p>
          )}

          {candidates && candidates.length > 0 && (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {candidates.map((c, i) => (
                <li key={`${c.source}-${c.title}-${c.score}-${i}`}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <span className="w-10 flex-shrink-0 text-right text-base font-bold tabular-nums text-amber-300">{c.score}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[c.releaseYear, c.platforms].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </span>
                    <span className="flex-shrink-0 text-xs text-muted-foreground">{SCORE_SOURCE_LABEL[c.source]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t('fieldScoreHint')}</p>
    </div>
  )
}
