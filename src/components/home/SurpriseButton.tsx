'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Dices, Loader2 } from 'lucide-react'

/**
 * "Surprise me": jumps to a random game (weighted by popularity server-side).
 * Always works, even before any popularity sync.
 */
export function SurpriseButton() {
  const t = useTranslations('Home')
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const go = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/games/random')
      const data = await res.json()
      if (res.ok && data.id) router.push(`/game/${data.id}`)
      else setBusy(false)
    } catch {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={go}
      disabled={busy}
      className="inline-flex items-center gap-2 px-3.5 py-2 text-sm rounded-md bg-secondary border border-border hover:bg-accent hover:text-foreground text-muted-foreground transition-colors disabled:opacity-60 whitespace-nowrap"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Dices className="w-4 h-4" />}
      {t('surpriseMe')}
    </button>
  )
}
