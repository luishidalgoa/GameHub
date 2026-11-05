'use client'

import { useState } from 'react'
import type { BlacklistState } from '@/lib/blacklist'
import { AdminButton } from '@/components/admin/AdminButton'
import { runGameAction } from './game-actions'

interface Props {
  gameId: number
  initial: BlacklistState
  onChanged?: () => void
}

/**
 * The panel's blacklist control. One game: the same strategy the bulk bar runs on many.
 * Local files show why they cannot be listed instead of a button that would fail.
 */
export function BlacklistControl({ gameId, initial, onChanged }: Props) {
  const [state, setState] = useState<BlacklistState>(initial)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')

  const run = async (action: 'blacklist' | 'unblacklist') => {
    setBusy(true)
    setText('')
    const reply = await runGameAction(action, [gameId])
    setBusy(false)
    if (!reply.ok) {
      setText('No se pudo cambiar la lista negra.')
      return
    }
    if (action === 'blacklist') {
      setState('listed')
      setText(reply.counts.listed ? 'Añadido a la lista negra y oculto.' : 'Ya estaba en la lista negra.')
    } else {
      setState('free')
      setText((reply.counts.removed ?? 0) > 0 ? 'Quitado de la lista negra.' : 'No estaba en la lista negra.')
    }
    onChanged?.()
  }

  return (
    <section aria-labelledby="lista-negra-panel" className="space-y-2 border-t border-border pt-5">
      <h3 id="lista-negra-panel" className="text-sm font-medium">Lista negra</h3>
      {state === 'local' && (
        <p className="text-xs text-muted-foreground">Es un fichero local: no tiene identidad de catálogo y no puede ir a la lista negra.</p>
      )}
      {state === 'listed' && (
        <p className="text-xs text-muted-foreground">Está en la lista negra: la sincronización de torrents no lo vuelve a traer.</p>
      )}
      {state === 'free' && (
        <p className="text-xs text-muted-foreground">Viene de un torrent. Si la lista negra lo incluye, la sincronización no lo vuelve a crear.</p>
      )}
      <div className="flex items-center gap-3">
        {state === 'free' && (
          <AdminButton variant="danger" size="sm" type="button" disabled={busy} onClick={() => run('blacklist')}>
            Añadir a la lista negra
          </AdminButton>
        )}
        {state === 'listed' && (
          <AdminButton variant="secondary" size="sm" type="button" disabled={busy} onClick={() => run('unblacklist')}>
            Quitar de la lista negra
          </AdminButton>
        )}
        {state === 'local' && (
          <AdminButton variant="secondary" size="sm" type="button" disabled>
            No disponible
          </AdminButton>
        )}
        <span role="status" aria-live="polite" className="text-xs text-muted-foreground">{busy ? 'Guardando…' : text}</span>
      </div>
    </section>
  )
}
