'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { CommandPalette } from '@/components/shared/CommandPalette'
import { NavigationProgress } from './NavigationProgress'

export function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Mobile edge-swipe: swipe right from the left edge opens the drawer,
  // swipe left closes it.
  useEffect(() => {
    let x0 = 0, y0 = 0, fromEdge = false, tracking = false
    const onStart = (e: TouchEvent) => {
      if (window.innerWidth >= 768) return // drawer is permanent on desktop
      const tch = e.touches[0]
      x0 = tch.clientX; y0 = tch.clientY
      fromEdge = x0 <= 24
      tracking = sidebarOpen || fromEdge
    }
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      const tch = e.changedTouches[0]
      const dx = tch.clientX - x0
      const dy = tch.clientY - y0
      if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy)) return // not a clear horizontal swipe
      if (!sidebarOpen && fromEdge && dx > 0) setSidebarOpen(true)
      else if (sidebarOpen && dx < 0) setSidebarOpen(false)
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
    }
  }, [sidebarOpen])

  return (
    <div className="min-h-screen bg-background">
      <NavigationProgress />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 md:hidden animate-in fade-in duration-200"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <TopBar onMenuClick={() => setSidebarOpen(true)} />

      <main className="md:ml-56 mt-14 p-4 sm:p-6 min-h-[calc(100vh-3.5rem)]">
        {children}
      </main>

      <footer className="md:ml-56 border-t border-border px-4 sm:px-6 py-3">
        <p className="text-xs text-muted-foreground text-center flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
          <span>Hecho por</span>
          <a
            href="https://luishidalgoa.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-foreground hover:text-primary transition-colors"
          >
            Luis Hidalgo
          </a>
          <span className="text-border">·</span>
          <a
            href="https://luishidalgoa.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            portfolio →
          </a>
          <span className="text-border">·</span>
          <a href="/privacy" className="hover:text-foreground transition-colors">
            Privacidad y cookies
          </a>
          <span className="text-border">·</span>
          <a href="/donate" className="hover:text-foreground transition-colors">
            Apoyar
          </a>
        </p>
      </footer>

      <CommandPalette />
    </div>
  )
}
