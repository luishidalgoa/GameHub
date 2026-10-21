'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { getConsent } from '@/lib/cookie-consent'

// Module-level flag: resets on every full page load/reload, but survives
// SPA navigation (the JS module stays mounted). This gives us per-reload
// counting without counting every client-side route change.
let _firedThisLoad = false

export function TrackingBeacon() {
  const pathname = usePathname()

  useEffect(() => {
    if (pathname.startsWith('/admin')) return
    if (getConsent() !== 'all') return
    if (_firedThisLoad) return

    _firedThisLoad = true
    // Browser-side page load time, not server latency. The server cannot see its
    // own errors through this beacon, so no HTTP status is sent.
    const send = () => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      const durationMs = nav && nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd) : undefined
      navigator.sendBeacon('/api/track/visit', JSON.stringify({ path: pathname, durationMs }))
    }
    if (document.readyState === 'complete') send()
    else window.addEventListener('load', send, { once: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
