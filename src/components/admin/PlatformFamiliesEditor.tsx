'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Save, Loader2 } from 'lucide-react'
import type { PlatformFamily } from '@/lib/platform-family'
import { AdminButton } from '@/components/admin/AdminButton'

interface PlatformRef { slug: string; name: string }

const toSlug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Familias de consolas: agrupa varias plataformas en una sola entrada del menú y de la portada.
 * Cada consola va en una sola familia; la etiqueta es lo que se ve en el filtro de la familia.
 */
export function PlatformFamiliesEditor({ platforms, initial }: { platforms: PlatformRef[]; initial: PlatformFamily[] }) {
  const router = useRouter()
  const [families, setFamilies] = useState<PlatformFamily[]>(initial)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  const familyOfSlug = (slug: string) => families.findIndex(f => f.members.some(m => m.slug === slug))
  const nameOf = (slug: string) => platforms.find(p => p.slug === slug)?.name ?? slug

  const update = (i: number, patch: Partial<PlatformFamily>) =>
    setFamilies(prev => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  const toggleMember = (i: number, slug: string) => {
    const owner = familyOfSlug(slug)
    if (owner !== -1 && owner !== i) return
    setFamilies(prev => prev.map((f, j) => {
      if (j !== i) return f
      const has = f.members.some(m => m.slug === slug)
      return {
        ...f,
        members: has
          ? f.members.filter(m => m.slug !== slug)
          : [...f.members, { slug, label: slug.toUpperCase().slice(0, 8) }],
      }
    }))
  }

  const setLabel = (i: number, slug: string, label: string) =>
    setFamilies(prev => prev.map((f, j) => (j === i
      ? { ...f, members: f.members.map(m => (m.slug === slug ? { ...m, label } : m)) }
      : f)))

  const add = () => setFamilies(prev => [...prev, { slug: '', name: '', members: [] }])
  const remove = (i: number) => setFamilies(prev => prev.filter((_, j) => j !== i))

  const save = async () => {
    setSaving(true)
    setStatus(null)
    const payload = families.map(f => ({ ...f, slug: f.slug || toSlug(f.name) }))
    const res = await fetch('/api/platform-families', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ families: payload }),
    })
    setSaving(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setStatus({ ok: false, text: data.error ?? 'No se pudo guardar' }); return }
    setFamilies(data)
    setStatus({ ok: true, text: 'Familias guardadas: el menú y la portada ya las usan' })
    router.refresh()
  }

  return (
    <div className="space-y-4 border-t border-border pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-semibold">Familias de consolas</h3>
          <p className="text-sm text-muted-foreground">
            Agrupa consolas en una sola entrada del menú y de la portada, con un filtro por consola.
            Cada consola va en una sola familia.
          </p>
        </div>
        <div className="flex gap-2">
          <AdminButton variant="secondary" size="md" type="button" onClick={add}>
            <Plus className="h-4 w-4" /> Añadir familia
          </AdminButton>
          <AdminButton variant="primary" size="md" type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar familias
          </AdminButton>
        </div>
      </div>

      {status && <p className={`text-sm ${status.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{status.text}</p>}

      {families.length === 0 && <p className="text-sm text-muted-foreground">No hay familias. Cada consola aparece sola en el menú.</p>}

      {families.map((f, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={f.name}
              onChange={e => update(i, { name: e.target.value, slug: f.slug || toSlug(e.target.value) })}
              placeholder="Nombre de la familia"
              aria-label="Nombre de la familia"
              className="min-w-0 flex-1 rounded-md border border-border bg-secondary px-2.5 py-1.5 text-sm sm:max-w-xs"
            />
            <span className="font-mono text-xs text-muted-foreground">{f.slug || toSlug(f.name) || '—'}</span>
            <AdminButton variant="danger" size="sm" type="button" onClick={() => remove(i)} aria-label="Quitar familia"
                         className="ml-auto">
              <Trash2 className="h-4 w-4" />
            </AdminButton>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {platforms.map(p => {
              const member = f.members.some(m => m.slug === p.slug)
              const owner = familyOfSlug(p.slug)
              const taken = owner !== -1 && owner !== i
              return (
                <button
                  key={p.slug}
                  type="button"
                  disabled={taken}
                  onClick={() => toggleMember(i, p.slug)}
                  aria-pressed={member}
                  title={taken ? `Ya está en ${families[owner].name}` : undefined}
                  className={`rounded-full border px-2.5 py-0.5 text-xs disabled:opacity-40 ${member ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:bg-secondary'}`}
                >
                  {p.name}
                </button>
              )
            })}
          </div>

          {f.members.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {f.members.map(m => (
                <label key={m.slug} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">{nameOf(m.slug)}</span>
                  <span>etiqueta</span>
                  <input
                    value={m.label}
                    onChange={e => setLabel(i, m.slug, e.target.value)}
                    maxLength={8}
                    aria-label={`Etiqueta de ${nameOf(m.slug)}`}
                    className="w-20 rounded-md border border-border bg-secondary px-2 py-1 text-sm text-foreground"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
