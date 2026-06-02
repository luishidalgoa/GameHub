'use client'

import { useEffect, useState } from 'react'

/**
 * Reactively reports the user's "reduce motion" OS preference. JS-driven effects
 * (card tilt, hero parallax, etc.) read this to disable themselves — CSS
 * animations are handled by the global media query in globals.css.
 * Returns false during SSR / first paint, then the real value after mount.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}
