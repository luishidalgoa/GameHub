'use client'

import { useEffect, useRef, useState } from 'react'
import type { ConsoleModel } from '@/lib/consoles'
import type { ConsoleHandle } from '@/lib/console-scene'

/**
 * A console model that floats and turns. It mounts only when it scrolls near the
 * viewport, so a visitor who never reaches it never downloads three.js or the
 * model. With no WebGL, or if the file fails, it renders nothing: the page around
 * it does not depend on it.
 */
export function ConsoleViewer({ model, className }: { model: ConsoleModel; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'idle' | 'ready' | 'failed'>('idle')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    let handle: ConsoleHandle | null = null

    const mount = () => {
      import('@/lib/console-scene')
        .then(m => m.mountConsole(el, { url: model.file, baseRotation: model.baseRotation }))
        .then(h => {
          if (cancelled) { h.dispose(); return }
          handle = h
          setState('ready')
        })
        .catch(() => { if (!cancelled) setState('failed') })
    }

    // Start loading a screen before the viewer comes into view.
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        io.disconnect()
        mount()
      }
    }, { rootMargin: '400px' })
    io.observe(el)

    return () => {
      cancelled = true
      io.disconnect()
      handle?.dispose()
    }
  }, [model.file, model.baseRotation])

  return <div ref={ref} className={className} aria-hidden="true" data-state={state} />
}
