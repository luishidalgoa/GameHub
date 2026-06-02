'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

// Lightweight, dependency-free toast system. `toast(msg)` can be called from
// anywhere (no provider needed) — it dispatches a window event the mounted
// <Toaster/> listens for. Auto-dismisses; respects reduced motion via CSS.

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem { id: number; message: string; kind: ToastKind }

const EVENT = 'gh:toast'
let seq = 0

export function toast(message: string, kind: ToastKind = 'success') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ToastItem>(EVENT, {
    detail: { id: ++seq, message, kind },
  }))
}

const ICON = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  error:   <XCircle className="w-4 h-4 text-rose-400" />,
  info:    <Info className="w-4 h-4 text-sky-400" />,
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<ToastItem>).detail
      setToasts(prev => [...prev, t])
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3200)
    }
    window.addEventListener(EVENT, onToast)
    return () => window.removeEventListener(EVENT, onToast)
  }, [])

  const dismiss = (id: number) => setToasts(prev => prev.filter(x => x.id !== id))

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] sm:w-auto sm:max-w-sm pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="animate-card-in pointer-events-auto flex items-center gap-2.5 bg-card border border-border rounded-lg shadow-2xl px-3.5 py-2.5"
        >
          {ICON[t.kind]}
          <span className="text-sm text-foreground flex-1 leading-snug">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
