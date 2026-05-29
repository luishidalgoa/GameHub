'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Thin top loading bar shown during route transitions (YouTube/NProgress style)
 * so navigation never feels stuck — important on a slow self-hosted server.
 *
 * Start is detected by intercepting internal link clicks and patching
 * history.pushState (covers router.push). Completion fires when the pathname
 * changes. A safety timeout prevents a stuck bar if navigation is cancelled.
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible]   = useState(false)

  const trickle = useRef<ReturnType<typeof setInterval>>()
  const timers  = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearAll = () => {
    if (trickle.current) clearInterval(trickle.current)
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  const start = () => {
    clearAll()
    setVisible(true)
    setProgress(10)
    trickle.current = setInterval(() => {
      setProgress(p => (p < 90 ? p + Math.max(0.4, (90 - p) * 0.08) : p))
    }, 180)
    // Safety: if the route never changes (cancelled nav), auto-finish.
    timers.current.push(setTimeout(() => finish(), 10_000))
  }

  const finish = () => {
    clearAll()
    setProgress(100)
    timers.current.push(setTimeout(() => setVisible(false), 220))
    timers.current.push(setTimeout(() => setProgress(0), 450))
  }

  // Complete whenever the route resolves.
  useEffect(() => {
    finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Detect navigation start.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement | null)?.closest?.('a')
      if (!anchor) return
      const href   = anchor.getAttribute('href')
      const target = anchor.getAttribute('target')
      if (!href || (target && target !== '_self') || href.startsWith('#') || anchor.hasAttribute('download')) return
      try {
        const dest = new URL(href, window.location.href)
        if (dest.origin !== window.location.origin) return
        if (dest.pathname === window.location.pathname && dest.search === window.location.search) return
        start()
      } catch { /* ignore bad href */ }
    }

    document.addEventListener('click', onClick, true)

    // Catch programmatic navigation (router.push/replace use history.pushState)
    const origPush = history.pushState
    history.pushState = function (this: History, ...args: Parameters<History['pushState']>) {
      try {
        const url = args[2]
        if (url) {
          const dest = new URL(String(url), window.location.href)
          if (dest.pathname !== window.location.pathname) start()
        }
      } catch { /* ignore */ }
      return origPush.apply(this, args)
    }

    return () => {
      document.removeEventListener('click', onClick, true)
      history.pushState = origPush
      clearAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!visible && progress === 0) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-0.5 pointer-events-none">
      <div
        className="h-full bg-primary transition-[width,opacity] duration-200 ease-out"
        style={{
          width:      `${progress}%`,
          opacity:    visible ? 1 : 0,
          boxShadow:  '0 0 8px hsl(var(--primary)), 0 0 4px hsl(var(--primary))',
        }}
      />
    </div>
  )
}
