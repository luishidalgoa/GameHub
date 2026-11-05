'use client'

import { useState } from 'react'
import { AdminButton } from '@/components/admin/AdminButton'
import { fillMetadataFor, runGameAction, type ClientGameAction, type FillProgress } from './game-actions'

interface Props {
  ids: number[]
  /** After any action: the list reloads its rows, so a hidden game leaves the table. */
  onDone: () => void
  onClear: () => void
}

const n = (x: number | undefined) => (x ?? 0).toLocaleString('es-ES')

/** The bulk bar over the table. It runs the same strategies as the panel. */
export function GameBulkBar({ ids, onDone, onClear }: Props) {
  const [busy, setBusy] = useState<ClientGameAction | null>(null)
  const [progress, setProgress] = useState<FillProgress | null>(null)
  const [text, setText] = useState('')

  const run = async (action: ClientGameAction) => {
    if (busy || ids.length === 0) return
    setBusy(action)
    setText('')
    setProgress(null)
    if (action === 'fillMetadata') {
      const r = await fillMetadataFor(ids, setProgress)
      setText(`Metadatos: ${n(r.filled)} rellenados, ${n(r.failed)} sin resultado.`)
    } else {
      const r = await runGameAction(action, ids)
      setText(r.ok ? summary(action, r.counts) : 'No se pudo completar la acción.')
    }
    setBusy(null)
    setProgress(null)
    onDone()
  }

  return (
    <div role="region" aria-label="Acciones sobre la selección" className="fixed bottom-4 left-1/2 z-30 flex w-[min(96vw,56rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-2xl backdrop-blur">
      <span className="mr-2 text-sm font-medium tabular-nums">{n(ids.length)} seleccionados</span>
      <AdminButton variant="danger" size="sm" type="button" disabled={!!busy} onClick={() => run('blacklist')}>Lista negra</AdminButton>
      <AdminButton variant="secondary" size="sm" type="button" disabled={!!busy} onClick={() => run('favorite')}>Favorito</AdminButton>
      <AdminButton variant="secondary" size="sm" type="button" disabled={!!busy} onClick={() => run('unfavorite')}>Quitar favorito</AdminButton>
      <AdminButton variant="primary" size="sm" type="button" disabled={!!busy} onClick={() => run('fillMetadata')}>Rellenar metadatos</AdminButton>
      <AdminButton variant="ghost" size="sm" type="button" disabled={!!busy} onClick={onClear}>Limpiar</AdminButton>
      <span role="status" aria-live="polite" className="ml-auto text-xs text-muted-foreground">
        {busy === 'fillMetadata' && progress ? `Rellenando ${n(progress.done)} de ${n(progress.total)}…` : busy ? 'Aplicando…' : text}
      </span>
    </div>
  )
}

function summary(action: ClientGameAction, c: Record<string, number>): string {
  switch (action) {
    case 'blacklist':
      return `Lista negra: ${n(c.listed)} añadidos, ${n(c.alreadyListed)} ya estaban, ${n(c.notBlacklistable)} sin lista negra (ficheros locales).`
    case 'unblacklist':
      return `Lista negra: ${n(c.removed)} quitados.`
    case 'favorite':
      return `${n(c.updated)} marcados como favoritos.`
    case 'unfavorite':
      return `${n(c.updated)} quitados de favoritos.`
    default:
      return ''
  }
}
