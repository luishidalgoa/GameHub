'use client'

import { useEffect } from 'react'

/**
 * Preserves the window scroll position for a list page across navigation (e.g.
 * editing a game and coming back). The position is stored in sessionStorage
 * keyed by `storageKey` (include the filters/page so each variant restores its
 * own spot), saved continuously while scrolling, and restored on mount.
 *
 * Drop it once near the top of a server-rendered list page:
 *   <ScrollRestorer storageKey={`admin-games:${search}:${platform}:${page}`} />
 */
export function ScrollRestorer({ storageKey }: { storageKey: string }) {
  useEffect(() => {
    const key = `scroll:${storageKey}`

    // Restore after paint so the (already server-rendered) list has its height.
    const saved = sessionStorage.getItem(key)
    if (saved) {
      const y = parseInt(saved, 10)
      if (!Number.isNaN(y)) {
        // rAF twice: let layout settle before jumping.
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)))
      }
    }

    // Save throttled while scrolling, and once more on unmount/navigation.
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        sessionStorage.setItem(key, String(window.scrollY))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      sessionStorage.setItem(key, String(window.scrollY))
    }
  }, [storageKey])

  return null
}
