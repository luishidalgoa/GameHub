'use client'

import { useState } from 'react'
import { AdminButton } from '@/components/admin/AdminButton'
import { runGameAction } from './game-actions'

interface Props {
  gameId: number
  initialHidden: boolean
  onChanged?: () => void
}

/**
 * Hide or show a local file by hand. It is the cementerio's hide, not the blacklist:
 * a local file has no catalog identity, so nothing keeps it from coming back on a scan.
 */
export function VisibilityControl({ gameId, initialHidden, onChanged }: Props) {
  const [hidden, setHidden] = useState(initialHidden)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')

  const run = async (action: 'hide' | 'unhide') => {
    setBusy(true)
    setText('')
    const reply = await runGameAction(action, [gameId])
    setBusy(false)
    if (!reply.ok) {
      setText('No se pudo cambiar la visibilidad.')
      return
    }
    if (action === 'hide') {
      setHidden(true)
      setText('Oculto en el cementerio.')
    } else if ((reply.counts.stillMissing ?? 0) > 0) {
      // The file is still missing: the scanner keeps it hidden until it is found again.
      setText('Sigue oculto porque el fichero no está en el disco.')
    } else {
      setHidden(false)
      setText('Visible otra vez.')
    }
    onChanged?.()
  }

  return (
    <section aria-labelledby="visibilidad-panel" className="space-y-2 border-t border-border pt-5">
      <h3 id="visibilidad-panel" className="text-sm font-medium">Visibilidad</h3>
      <p className="text-xs text-muted-foreground">
        {hidden
          ? 'Oculto. No aparece en la biblioteca, pero el fichero sigue en el disco.'
          : 'Visible en la biblioteca. Ocultarlo lo manda al cementerio.'}
      </p>
      <div className="flex items-center gap-3">
        {hidden
          ? <AdminButton variant="secondary" size="sm" type="button" disabled={busy} onClick={() => run('unhide')}>Mostrar</AdminButton>
          : <AdminButton variant="secondary" size="sm" type="button" disabled={busy} onClick={() => run('hide')}>Ocultar</AdminButton>}
        <span role="status" aria-live="polite" className="text-xs text-muted-foreground">{busy ? 'Guardando…' : text}</span>
      </div>
    </section>
  )
}
