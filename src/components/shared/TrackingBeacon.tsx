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
    navigator.sendBeacon('/api/track/visit', JSON.stringify({ path: pathname }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
