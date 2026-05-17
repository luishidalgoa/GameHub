'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Trash2, AlertTriangle } from 'lucide-react'

// ── Single-game delete ────────────────────────────────────────────────────────

export function DeleteGameButton({ id }: { id: number }) {
  const t = useTranslations('AdminGraveyard')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const handleDelete = () => {
    if (!window.confirm(t('confirmDelete'))) return
    startTransition(async () => {
      await fetch('/api/admin/graveyard', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      title={t('deleteTitle')}
      className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  )
}

// ── Purge all ─────────────────────────────────────────────────────────────────

export function PurgeAllButton({ count }: { count: number }) {
  const t = useTranslations('AdminGraveyard')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmed, setConfirmed] = useState(false)

  if (count === 0) return null

  if (!confirmed) {
    return (
      <button
        onClick={() => setConfirmed(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-red-700/40 text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        {t('purgeAll')}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-950/40 border border-red-700/50 rounded-md text-sm">
      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
      <span className="text-red-300">{t('purgeConfirm', { count })}</span>
      <button
        onClick={() => {
          startTransition(async () => {
            await fetch('/api/admin/graveyard', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ purge: true }),
            })
            setConfirmed(false)
            router.refresh()
          })
        }}
        disabled={pending}
        className="ml-1 px-2 py-0.5 text-xs font-medium bg-red-700 hover:bg-red-600 text-white rounded transition-colors disabled:opacity-50"
      >
        {pending ? t('deleting') : t('purgeYes')}
      </button>
      <button
        onClick={() => setConfirmed(false)}
        disabled={pending}
        className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
      >
        {t('cancel')}
      </button>
    </div>
  )
}
