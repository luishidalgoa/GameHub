'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Download } from 'lucide-react'

export interface TopGame {
  id:           number
  title:        string
  downloads:    number
  platformName: string
  platformSlug: string
}

// Keep alias so existing import in page.tsx doesn't break
export type { TopGame as PlatformTopGames }

export function TopDownloads({ games }: { games: TopGame[] }) {
  const t = useTranslations('Home')
  const [activePlatform, setActivePlatform] = useState<string | null>(null)

  if (games.length === 0) return null

  // Unique platforms in download-count order (order preserved from parent sort)
  const platforms = Array.from(
    new Map(games.map((g) => [g.platformSlug, g.platformName])).entries()
  )

  const filtered = activePlatform
    ? games.filter((g) => g.platformSlug === activePlatform)
    : games

  return (
    <section className="mt-8">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mr-1">
          {t('topDownloads')}
        </h2>

        {/* Platform pills */}
        <button
          onClick={() => setActivePlatform(null)}
          className={`px-2.5 py-0.5 rounded-full text-xs transition-colors ${
            activePlatform === null
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('topDownloadsAll')}
        </button>

        {platforms.map(([slug, name]) => (
          <button
            key={slug}
            onClick={() => setActivePlatform(slug === activePlatform ? null : slug)}
            className={`px-2.5 py-0.5 rounded-full text-xs transition-colors ${
              activePlatform === slug
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <ol>
          {filtered.map((game, i) => (
            <li key={game.id} className="border-b border-border/50 last:border-0">
              <Link
                href={`/game/${game.id}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors"
              >
                <span className="text-xs tabular-nums text-muted-foreground/40 w-5 shrink-0 text-right">
                  {i + 1}
                </span>

                <span className="text-sm text-foreground/80 truncate flex-1">
                  {game.title}
                </span>

                {activePlatform === null && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0 hidden sm:inline">
                    {game.platformName}
                  </span>
                )}

                <span className="flex items-center gap-1 text-xs text-muted-foreground/60 shrink-0 tabular-nums">
                  <Download className="w-3 h-3" />
                  {game.downloads}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
