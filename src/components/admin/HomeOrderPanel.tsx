'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import type { HomeSection } from '@/lib/home-order'

export function HomeOrderPanel({ initial, labels }: { initial: HomeSection[]; labels: Record<HomeSection, string> }) {
  const [order, setOrder] = useState<HomeSection[]>(initial)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return
    const next = [...order]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setOrder(next)
    setStatus(null)
  }

  const save = async () => {
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/home-order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      })
      setStatus(res.ok ? 'Orden guardado' : 'No se pudo guardar')
    } catch {
      setStatus('No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div>
        <h2 className="font-semibold">Orden de las secciones de la portada</h2>
        <p className="mt-1 text-sm text-muted-foreground">Arrastra cada sección o usa las flechas. La cabecera y el carrusel de destacados no cambian.</p>
      </div>

      <ol className="space-y-2">
        {order.map((key, i) => (
          <li
            key={key}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => { if (dragIndex !== null) move(dragIndex, i); setDragIndex(null) }}
            onDragEnd={() => setDragIndex(null)}
            className={`flex items-center gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2.5 cursor-grab active:cursor-grabbing ${dragIndex === i ? 'opacity-50' : ''}`}
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
            <span className="w-6 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
            <span className="flex-1 text-sm">{labels[key]}</span>
            <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Subir" className="p-1 rounded hover:bg-accent disabled:opacity-30">
              <ChevronUp className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => move(i, i + 1)} disabled={i === order.length - 1} aria-label="Bajar" className="p-1 rounded hover:bg-accent disabled:opacity-30">
              <ChevronDown className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar orden'}
        </button>
        {status && <span className="text-sm text-muted-foreground">{status}</span>}
      </div>
    </div>
  )
}
