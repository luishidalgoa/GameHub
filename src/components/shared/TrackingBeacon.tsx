'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { getConsent } from '@/lib/cookie-consent'

const SESSION_KEY = 'gh_visited'

export function TrackingBeacon() {
  const pathname = usePathname()

  useEffect(() => {
    // Skip admin paths
    if (pathname.startsWith('/admin')) return

    // Only fire if the user has explicitly accepted analytics cookies
    if (getConsent() !== 'all') return

    // Only track once per browser session
    if (sessionStorage.getItem(SESSION_KEY)) return

    sessionStorage.setItem(SESSION_KEY, '1')
    navigator.sendBeacon(
      '/api/track/visit',
      JSON.stringify({ path: pathname })
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
