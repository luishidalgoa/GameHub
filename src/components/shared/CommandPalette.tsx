'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Command } from 'cmdk'
import { Search, Gamepad2, Loader2, X } from 'lucide-react'
import useSWR from 'swr'

interface GameResult {
  id: number
  title: string
  coverPath: string | null
  coverUrl: string | null
  releaseYear: number | null
  platform: { name: string; slug: string }
}

interface PlatformResult {
  id: number
  name: string
  slug: string
  _count: { games: number }
}

interface SearchData {
  games: GameResult[]
  platforms: PlatformResult[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function GameCover({ game }: { game: GameResult }) {
  const src = game.coverPath || game.coverUrl
  const initial = game.title.charAt(0).toUpperCase()

  if (!src) {
    return (
      <div className="w-8 h-11 rounded flex-shrink-0 bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground">
        {initial}
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="w-8 h-11 rounded flex-shrink-0 object-cover bg-secondary"
    />
  )
}

export function CommandPalette() {
  const t = useTranslations('CommandPalette')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const router = useRouter()

  const { data, isLoading } = useSWR<SearchData>(
    open ? `/api/search?q=${encodeURIComponent(query)}` : null,
    fetcher,
    { keepPreviousData: true }
  )

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const goTo = (path: string) => {
    router.push(path)
    close()
  }

  const hasGames     = (data?.games?.length ?? 0) > 0
  const hasPlatforms = (data?.platforms?.length ?? 0) > 0
  const isEmpty      = !isLoading && query.length > 0 && !hasGames && !hasPlatforms

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
      />

      {/* Panel */}
      <Command
        className="relative z-10 w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
        shouldFilter={false}
        loop
        onKeyDown={(e) => { if (e.key === 'Escape') close() }}
      >
        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 border-b border-border">
          {isLoading
            ? <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
            : <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          }
          <Command.Input
            placeholder={t('placeholder')}
            value={query}
            onValueChange={setQuery}
            className="flex-1 bg-transparent py-4 text-sm placeholder:text-muted-foreground focus:outline-none"
            autoFocus
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:flex items-center text-[10px] font-mono text-muted-foreground/50 bg-secondary border border-border/60 rounded px-1.5 py-0.5 flex-shrink-0">
              ESC
            </kbd>
          )}
        </div>

        {/* Results */}
        <Command.List className="overflow-y-auto p-2" style={{ maxHeight: '60vh' }}>

          {/* Empty state */}
          {isEmpty && (
            <Command.Empty className="py-10 text-center text-sm text-muted-foreground">
              {t('noResults', { query })}
            </Command.Empty>
          )}

          {/* Platforms group — always shown (all platforms when empty, filtered when typing) */}
          {hasPlatforms && (
            <Command.Group
              heading={query ? t('groupPlatforms') : t('groupQuickNav')}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground/70 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide"
            >
              {data!.platforms.map((p) => (
                <Command.Item
                  key={`platform-${p.id}`}
                  value={`platform-${p.slug}-${p.name}`}
                  onSelect={() => goTo(`/platform/${p.slug}`)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer outline-none transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-foreground hover:bg-accent/50"
                >
                  <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                    <Gamepad2 className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <span className="flex-1 font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t('gameCount', { n: p._count.games })}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Games group */}
          {hasGames && (
            <Command.Group
              heading={t('groupGames')}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground/70 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide mt-1"
            >
              {data!.games.map((g) => (
                <Command.Item
                  key={`game-${g.id}`}
                  value={`game-${g.id}-${g.title}`}
                  onSelect={() => goTo(`/game/${g.id}`)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer outline-none transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-foreground hover:bg-accent/50"
                >
                  <GameCover game={g} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{g.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {g.platform.name}
                      {g.releaseYear && <span className="ml-2 opacity-60">{g.releaseYear}</span>}
                    </p>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Hint at the bottom */}
          {!isEmpty && (data?.games?.length ?? 0) === 0 && !query && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground/50 text-center">
              {t('hint')}
            </p>
          )}
        </Command.List>

        {/* Footer bar */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-secondary/30">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
            <kbd className="font-mono bg-secondary border border-border/60 rounded px-1 py-0.5">↑↓</kbd>
            {t('navHint')}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
            <kbd className="font-mono bg-secondary border border-border/60 rounded px-1 py-0.5">↵</kbd>
            {t('selectHint')}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 ml-auto">
            <kbd className="font-mono bg-secondary border border-border/60 rounded px-1 py-0.5">Ctrl K</kbd>
            {t('toggleHint')}
          </span>
        </div>
      </Command>
    </div>
  )
}
