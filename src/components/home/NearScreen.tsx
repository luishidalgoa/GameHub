'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Renders its children only while it is near the screen. It is for decoration that
 * is costly to paint, like a large CSS blur, so a long page holds a handful at a
 * time instead of one per tile. The margin is wide enough that a layer is ready
 * before it scrolls into view.
 */
export function NearScreen({ children, className, margin = 400 }: {
  children: ReactNode
  className?: string
  margin?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: `${margin}px` })
    io.observe(el)
    return () => io.disconnect()
  }, [margin])

  return <div ref={ref} className={className}>{near ? children : null}</div>
}
