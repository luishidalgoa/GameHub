'use client'

import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion'

/**
 * Blurred hero backdrop with a subtle parallax: it drifts slightly as the page
 * scrolls, giving the featured banner depth. Disabled under reduced motion.
 */
export function HeroBackground({ src }: { src: string }) {
  const ref = useRef<HTMLImageElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced) return
    const el = ref.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const rect = el.getBoundingClientRect()
        // Only animate while roughly in view; offset by how far we've scrolled past it.
        const shift = Math.max(-40, Math.min(40, -rect.top * 0.08))
        el.style.transform = `scale(1.15) translateY(${shift}px)`
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [reduced])

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt=""
      className="absolute inset-0 w-full h-full object-cover scale-110 blur-sm opacity-40 will-change-transform"
    />
  )
}
