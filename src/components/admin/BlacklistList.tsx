'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminButton } from '@/components/admin/AdminButton'
import { runGameAction } from './game-actions'

export interface BlacklistRow {
  id: number
  title: string
  identity: string
  source: string | null
  reason: string
  createdAt: string
  platform: { name: string; slug: string }
}

/** The blacklist rows, with restore for one or many. It runs the same strategy as the table. */
export function BlacklistList({ items }: { items: BlacklistRow[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')

  const allChecked = items.length > 0 && items.every(i => selected.has(i.id))
  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(items.map(i => i.id)))

  const restore = async (ids: number[]) => {
    if (busy || ids.length === 0) return
    setBusy(true)
    setText('')
    const reply = await runGameAction('unblacklistEntries', ids)
    setBusy(false)
    if (!reply.ok) {
      setText('No se pudo quitar de la lista negra.')
      return
    }
    setText(`${(reply.counts.removed ?? 0).toLocaleString('es-ES')} quitados. ${(reply.counts.revealed ?? 0).toLocaleString('es-ES')} juegos vuelven a verse.`)
    setSelected(new Set())
    router.refresh()
  }

  if (items.length === 0) {
    return <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">Ningún juego en la lista negra con este filtro.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <AdminButton variant="danger" size="sm" type="button" disabled={busy || selected.size === 0} onClick={() => restore([...selected])}>
          Quitar {selected.size > 0 ? `${selected.size} ` : ''}de la lista negra
        </AdminButton>
        <span role="status" aria-live="polite" className="text-xs text-muted-foreground">{busy ? 'Quitando…' : text}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th scope="col" className="w-10 px-3 py-3 font-medium">
                  <input type="checkbox" aria-label="Seleccionar todos" checked={allChecked} onChange={toggleAll} className="accent-violet-500" />
                </th>
                <th scope="col" className="px-3 py-3 font-medium">Título</th>
                <th scope="col" className="px-3 py-3 font-medium">Plataforma</th>
                <th scope="col" className="px-3 py-3 font-medium">Fuente</th>
                <th scope="col" className="px-3 py-3 font-medium">Identidad</th>
                <th scope="col" className="px-3 py-3 font-medium">Añadido</th>
                <th scope="col" className="px-3 py-3 font-medium"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} className="border-b border-border/50 last:border-0 hover:bg-accent/20">
                  <td className="px-3 py-2">
                    <input type="checkbox" aria-label={`Seleccionar ${i.title}`} checked={selected.has(i.id)} onChange={() => toggle(i.id)} className="accent-violet-500" />
                  </td>
                  <td className="max-w-xs px-3 py-2"><span className="block truncate font-medium">{i.title}</span></td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{i.platform.name}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{i.source ?? '—'}</td>
                  <td className="max-w-[220px] px-3 py-2"><span title={i.identity} className="block truncate font-mono text-xs text-muted-foreground/70">{i.identity}</span></td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {new Date(i.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <AdminButton variant="ghost" size="sm" type="button" disabled={busy} onClick={() => restore([i.id])}>Quitar</AdminButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
