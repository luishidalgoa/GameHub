'use client'

import { useEffect, useRef } from 'react'

/** Fades and lifts its children in when they first scroll into view. */
export function Reveal({ children, className, index = 0, as: Tag = 'div' }: {
  children: React.ReactNode
  className?: string
  /** Position in a group: later ones start a little after earlier ones. */
  index?: number
  as?: 'div' | 'section'
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.dataset.reveal = 'pending'
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        el.dataset.reveal = 'in'
        io.disconnect()
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const Component = Tag as 'div'
  return (
    <Component ref={ref} className={className} style={{ '--i': Math.min(index, 8) } as React.CSSProperties}>
      {children}
    </Component>
  )
}
