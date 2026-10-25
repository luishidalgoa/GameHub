'use client'

import { useState } from 'react'
import useSWRInfinite from 'swr/infinite'
import { useTranslations } from 'next-intl'

export interface ExternalGame {
  id: number
  title: string
  size: string | null
  format: string | null
  hasDlc: boolean
  cover: string | null
  year: number | null
  genre: string | null
  developer: string | null
  magnet: string
  sourceUrl: string
}

interface ApiPage { games: ExternalGame[]; total: number; page: number; pageSize: number }

const fetcher = (url: string): Promise<ApiPage> => fetch(url).then(r => r.json())

/** Torrents de la plataforma que la biblioteca no tiene. No los alojamos: solo enlazamos el magnet. */
export function TorrentGrid({ platformSlug, search }: { platformSlug: string; search: string }) {
  const t = useTranslations('GameGrid')
  const { data, size, setSize, isValidating } = useSWRInfinite<ApiPage>(
    (index, prev: ApiPage | null) => {
      if (prev && index * prev.pageSize >= prev.total) return null
      const p = new URLSearchParams({ platform: platformSlug, page: String(index + 1) })
      if (search) p.set('search', search)
      return `/api/external?${p}`
    },
    fetcher,
    { revalidateFirstPage: false, revalidateOnFocus: false },
  )

  const games = data?.flatMap(d => d.games) ?? []
  const total = data?.[0]?.total ?? 0
  const hasMore = games.length < total

  return (
    <div>
      <p className="mb-4 text-xs text-muted-foreground">{t('torrentNote')}</p>

      {!isValidating && games.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">{t('torrentEmpty')}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {games.map(g => <TorrentCard key={g.id} game={g} />)}
      </div>

      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setSize(size + 1)}
            disabled={isValidating}
            className="px-4 py-2 text-sm rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {t('torrentMore')}
          </button>
        </div>
      )}
    </div>
  )
}

function TorrentCard({ game }: { game: ExternalGame }) {
  const t = useTranslations('GameGrid')
  const [copied, setCopied] = useState(false)

  async function copyMagnet() {
    try {
      await navigator.clipboard.writeText(game.magnet)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const meta = [game.format, game.size, game.year].filter(Boolean).join(' · ')

  return (
    <div className="flex gap-3 rounded-lg border border-border bg-secondary/40 p-3">
      {game.cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={game.cover} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-20 w-16 shrink-0 rounded object-cover bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground" title={game.title}>{game.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {meta}{game.hasDlc && <span className="ml-2 text-sky-400">+ DLC</span>}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={copyMagnet}
            className="px-2.5 py-1 text-xs rounded-md bg-sky-600/20 border border-sky-600/40 text-sky-300 hover:bg-sky-600/30 transition-colors"
          >
            {copied ? t('copied') : t('copyMagnet')}
          </button>
          <a
            href={game.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('source')}
          </a>
        </div>
      </div>
    </div>
  )
}
