'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { CommandPalette } from '@/components/shared/CommandPalette'

export function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
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
