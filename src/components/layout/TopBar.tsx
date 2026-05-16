'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Search, X, Menu } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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
    query.length > 1 ? `/api/games?search=${encodeURIComponent(query)}&pageSize=8` : null,
    fetcher
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
        inputRef.current?.focus()
      }
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
            placeholder="Search games… (Ctrl+K)"
            value={query}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-secondary border border-border rounded-md pl-9 pr-8 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {open && query.length > 1 && data?.games && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50">
              {data.games.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">No results</p>
              ) : (
                data.games.map((g: { id: number; title: string }) => (
                  <button
                    key={g.id}
                    onMouseDown={() => navigateTo(g.id)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors truncate"
                  >
                    {g.title}
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
                  data.games.map((g: { id: number; title: string }) => (
                    <button
                      key={g.id}
                      onClick={() => navigateTo(g.id)}
                      className="w-full text-left px-4 py-4 text-sm hover:bg-accent active:bg-accent/80 transition-colors border-b border-border/40"
                    >
                      {g.title}
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
