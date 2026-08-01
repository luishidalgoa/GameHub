'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Search, X, Menu } from 'lucide-react'
import { PlatformIcon } from '@/components/shared/PlatformIcon'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/** Lo que devuelve /api/search para cada juego. */
interface Sugerencia {
  id: number
  title: string
  releaseYear: number | null
  platform: { name: string; slug: string; iconPath: string | null }
}

interface Props {
  onMenuClick?: () => void
}

export function TopBar({ onMenuClick }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const { data } = useSWR(
    // Mismo endpoint que la paleta de Ctrl+K: filtra igual (title contains, 8
    // resultados) y ya trae plataforma e icono para el badge.
    query.length > 1 ? `/api/search?q=${encodeURIComponent(query)}` : null,
    fetcher
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
        setMobileSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const openMobileSearch = () => {
    setMobileSearchOpen(true)
    setTimeout(() => mobileInputRef.current?.focus(), 50)
  }

  const navigateTo = (id: number) => {
    router.push(`/game/${id}`)
    setQuery('')
    setOpen(false)
    setMobileSearchOpen(false)
  }

  return (
    <>
      <header className="fixed top-0 left-0 right-0 md:left-56 h-14 bg-background/80 backdrop-blur-sm border-b border-border z-20 flex items-center px-3 sm:px-6 gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground flex-shrink-0 touch-manipulation"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Brand — mobile only */}
        <span className="md:hidden font-bold text-sm tracking-tight flex-shrink-0">GameHub</span>

        {/* Desktop search */}
        <div className="hidden sm:block relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search games…"
            value={query}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-secondary border border-border rounded-md pl-9 pr-8 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:flex items-center text-[10px] font-mono text-muted-foreground/50 bg-secondary border border-border/60 rounded px-1.5 py-0.5 hover:text-muted-foreground transition-colors"
            >
              Ctrl K
            </button>
          )}
          {open && query.length > 1 && data?.games && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50">
              {data.games.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">No results</p>
              ) : (
                data.games.map((g: Sugerencia) => (
                  <button
                    key={g.id}
                    onMouseDown={() => navigateTo(g.id)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors"
                  >
                    <span className="block truncate">{g.title}</span>
                    <Badge game={g} />
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Mobile search icon */}
        <button
          onClick={openMobileSearch}
          className="sm:hidden ml-auto p-2.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground touch-manipulation"
          aria-label="Search"
        >
          <Search className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile full-screen search overlay */}
      {mobileSearchOpen && (
        <div className="sm:hidden fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center gap-3 px-4 h-14 border-b border-border flex-shrink-0">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              ref={mobileInputRef}
              type="text"
              placeholder="Search games…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
              autoFocus
            />
            <button
              onClick={() => { setMobileSearchOpen(false); setQuery('') }}
              className="p-2.5 rounded-md hover:bg-accent text-muted-foreground touch-manipulation"
              aria-label="Close search"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {query.length > 1 ? (
              data?.games ? (
                data.games.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-muted-foreground text-center">
                    No results for &ldquo;{query}&rdquo;
                  </p>
                ) : (
                  data.games.map((g: Sugerencia) => (
                    <button
                      key={g.id}
                      onClick={() => navigateTo(g.id)}
                      className="w-full text-left px-4 py-4 text-sm hover:bg-accent active:bg-accent/80 transition-colors border-b border-border/40"
                    >
                      <span className="block truncate">{g.title}</span>
                      <Badge game={g} />
                    </button>
                  ))
                )
              ) : (
                <p className="px-4 py-8 text-sm text-muted-foreground text-center">Searching…</p>
              )
            ) : (
              <p className="px-4 py-8 text-sm text-muted-foreground text-center">
                Start typing to search…
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** Plataforma (y año) de una sugerencia. Mismo aspecto que en la paleta de
 *  Ctrl+K, para que los dos buscadores se lean igual. */
function Badge({ game }: { game: Sugerencia }) {
  return (
    <span className="flex items-center gap-2 mt-1">
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary border border-border text-[10px] font-medium text-muted-foreground leading-none">
        <PlatformIcon slug={game.platform.slug} iconPath={game.platform.iconPath} size={11} />
        {game.platform.name}
      </span>
      {game.releaseYear && (
        <span className="text-xs text-muted-foreground/60 tabular-nums">{game.releaseYear}</span>
      )}
    </span>
  )
}
