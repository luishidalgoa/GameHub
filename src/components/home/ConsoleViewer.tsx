'use client'

import { useEffect, useRef, useState } from 'react'
import type { ConsoleModel } from '@/lib/consoles'
import type { ConsoleHandle } from '@/lib/console-scene'

/**
 * A console model that floats and turns. It exists only while it is near the
 * viewport: it loads when it scrolls close and is released when it scrolls far
 * away, so a long page never holds more WebGL contexts than the viewer can see
 * (browsers allow about sixteen). A visitor who never reaches it never downloads
 * three.js or the model. With no WebGL, or if the file fails, it renders nothing:
 * the page around it does not depend on it.
 */
export function ConsoleViewer({ model, className }: { model: ConsoleModel; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'idle' | 'ready' | 'failed'>('idle')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let handle: ConsoleHandle | null = null
    let loading = 0   // bumped on every mount/release so a stale load is dropped
    let failed = false

    const release = () => {
      loading++
      handle?.dispose()
      handle = null
      setState(s => (s === 'failed' ? s : 'idle'))
    }
    const mount = () => {
      if (handle || failed) return
      const ticket = ++loading
      import('@/lib/console-scene')
        .then(m => m.mountConsole(el, { url: model.file, baseRotation: model.baseRotation }))
        .then(h => {
          if (ticket !== loading) { h.dispose(); return }
          handle = h
          setState('ready')
        })
        .catch(() => { failed = true; if (ticket === loading) setState('failed') })
    }

    // Start loading a screen before the viewer comes into view; release it well after it leaves.
    const io = new IntersectionObserver(entries => {
      const near = entries.some(e => e.isIntersecting)
      if (near) mount()
      else release()
    }, { rootMargin: '500px' })
    io.observe(el)

    return () => {
      io.disconnect()
      release()
    }
  }, [model.file, model.baseRotation])

  return <div ref={ref} className={className} aria-hidden="true" data-state={state} />
}
