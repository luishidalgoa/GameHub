'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FIELD_WEIGHTS, type FieldKey } from '@/lib/games/completeness'

export interface PanelGame {
  id: number
  title: string
  platformName: string
  releaseYear: number | null
  fileSizeLabel: string
  filePath: string
  description: string
  customNotes: string
  genre: string
  region: string
  languages: string
  developer: string
  publisher: string
  titleId: string
  rawgScore: number | null
  trailerUrl: string
  isFavorite: boolean
  isFeatured: boolean
  isHidden: boolean
  metadataFetchedAt: string | null
}

interface Props {
  game: PanelGame
  percent: number
  missing: FieldKey[]
  closeHref: string
  imagesHref: string
  prevHref: string | null
  nextHref: string | null
}

const input = 'bg-background border border-border rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const label = 'flex flex-col gap-1.5 text-sm text-muted-foreground'

/**
 * Panel lateral de la ficha: los mismos datos que la ficha completa, sin las imágenes
 * (esas tienen su panel). Escape cierra y vuelve a la lista con sus filtros.
 */
export function GamePanel({ game, percent, missing, closeHref, imagesHref, prevHref, nextHref }: Props) {
  const router = useRouter()
  const [form, setForm] = useState({
    title: game.title, description: game.description, customNotes: game.customNotes,
    genre: game.genre, region: game.region, languages: game.languages, developer: game.developer,
    publisher: game.publisher, titleId: game.titleId, trailerUrl: game.trailerUrl,
    releaseYear: game.releaseYear === null ? '' : String(game.releaseYear),
    rawgScore: game.rawgScore === null ? '' : String(game.rawgScore),
    isFavorite: game.isFavorite, isFeatured: game.isFeatured, isHidden: game.isHidden,
  })
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push(closeHref)
      if (e.key === 'ArrowUp' && prevHref && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) router.push(prevHref)
      if (e.key === 'ArrowDown' && nextHref && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) router.push(nextHref)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, closeHref, prevHref, nextHref])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    setStatus(null)
    const score = form.rawgScore === '' ? null : Math.max(0, Math.min(100, parseInt(form.rawgScore, 10)))
    const year = form.releaseYear === '' ? null : parseInt(form.releaseYear, 10)
    const res = await fetch(`/api/games/${game.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.trim(),
        description: form.description,
        customNotes: form.customNotes,
        genre: form.genre,
        region: form.region,
        languages: form.languages,
        developer: form.developer,
        publisher: form.publisher,
        titleId: form.titleId,
        trailerUrl: form.trailerUrl,
        releaseYear: year,
        rawgScore: score,
        scoreSource: score === null ? null : 'manual',
        isFavorite: form.isFavorite,
        isFeatured: form.isFeatured,
        isHidden: form.isHidden,
      }),
    })
    setSaving(false)
    setStatus(res.ok ? { ok: true, text: 'Cambios guardados' } : { ok: false, text: 'No se pudo guardar. Revisa los datos.' })
    if (res.ok) router.refresh()
  }

  const breakdown = FIELD_WEIGHTS.map(f => ({ ...f, filled: !missing.includes(f.key) }))

  return (
    <aside role="complementary" aria-labelledby="panel-titulo" className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 id="panel-titulo" className="truncate text-lg font-semibold">{game.title}</h2>
          <p className="text-xs text-muted-foreground">
            {game.platformName}{game.releaseYear ? ` · ${game.releaseYear}` : ''} · {game.fileSizeLabel}
          </p>
        </div>
        <div className="flex gap-1.5">
          {prevHref && <Link href={prevHref} aria-label="Juego anterior (flecha arriba)" className="rounded-md border border-border px-2.5 py-1 text-sm hover:bg-secondary">↑</Link>}
          {nextHref && <Link href={nextHref} aria-label="Juego siguiente (flecha abajo)" className="rounded-md border border-border px-2.5 py-1 text-sm hover:bg-secondary">↓</Link>}
          <Link href={closeHref} aria-label="Cerrar panel (Escape)" className="rounded-md border border-border px-2.5 py-1 text-sm hover:bg-secondary">×</Link>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section aria-labelledby="metadatos-panel" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 id="metadatos-panel" className="text-sm font-medium">Metadatos</h3>
            <span className="text-xl font-bold tabular-nums text-amber-300">{percent} %</span>
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {breakdown.map(f => (
              <li key={f.key} className={f.filled ? 'text-emerald-400' : 'text-rose-300'}>
                {f.filled ? '✓' : '✗'} {f.label} <span className="text-muted-foreground">{f.weight}</span>
              </li>
            ))}
          </ul>
        </section>

        <form aria-label="Datos del juego" className="space-y-3" onSubmit={e => { e.preventDefault(); save() }}>
          <h3 className="text-sm font-medium">Datos</h3>
          <label className={label}>Título<input className={input} value={form.title} onChange={e => set('title', e.target.value)} /></label>
          <label className={label}>Descripción<textarea rows={3} className={input} value={form.description} onChange={e => set('description', e.target.value)} /></label>
          <label className={label}>Notas propias<textarea rows={2} className={input} value={form.customNotes} onChange={e => set('customNotes', e.target.value)} placeholder="Solo para ti, no se muestran en la ficha" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>Género<input className={input} value={form.genre} onChange={e => set('genre', e.target.value)} /></label>
            <label className={label}>Año<input type="number" min={1970} max={2030} className={input} value={form.releaseYear} onChange={e => set('releaseYear', e.target.value)} /></label>
            <label className={label}>Región<input className={input} value={form.region} onChange={e => set('region', e.target.value)} /></label>
            <label className={label}>Idiomas<input className={input} value={form.languages} onChange={e => set('languages', e.target.value)} /></label>
            <label className={label}>Desarrollador<input className={input} value={form.developer} onChange={e => set('developer', e.target.value)} /></label>
            <label className={label}>Editora<input className={input} value={form.publisher} onChange={e => set('publisher', e.target.value)} /></label>
          </div>
          <label className={label}>ID de título<input className={input} value={form.titleId} onChange={e => set('titleId', e.target.value)} placeholder="Opcional" /></label>
          <label className={label}>Nota (0–100)<input type="number" min={0} max={100} className={input} value={form.rawgScore} onChange={e => set('rawgScore', e.target.value)} placeholder="Sin nota" /></label>
          <label className={label}>Tráiler (URL)<input type="url" className={input} value={form.trailerUrl} onChange={e => set('trailerUrl', e.target.value)} placeholder="https://www.youtube.com/watch?v=…" /></label>

          <fieldset className="space-y-2 pt-2">
            <legend className="text-sm font-medium">Indicadores</legend>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isFavorite} onChange={e => set('isFavorite', e.target.checked)} /> Favorito</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isFeatured} onChange={e => set('isFeatured', e.target.checked)} /> Destacado</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isHidden} onChange={e => set('isHidden', e.target.checked)} /> Oculto (cementerio)</label>
          </fieldset>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <span role="status" aria-live="polite" className={`text-sm ${status?.ok ? 'text-emerald-400' : 'text-rose-300'}`}>{status?.text ?? ''}</span>
          </div>
        </form>

        <section aria-labelledby="imagenes-panel" className="space-y-2 border-t border-border pt-5">
          <h3 id="imagenes-panel" className="text-sm font-medium">Imágenes</h3>
          <p className="text-xs text-muted-foreground">Portada, banner, fondo, logo y capturas se gestionan en su panel.</p>
          <Link href={imagesHref} className="inline-flex rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500">Abrir panel de imágenes →</Link>
          <p className="text-xs text-muted-foreground">Desde allí, «← Volver a la lista» devuelve a este panel con la misma lista.</p>
        </section>

        <section aria-labelledby="archivo-panel" className="space-y-1 border-t border-border pt-5">
          <h3 id="archivo-panel" className="text-sm font-medium">Archivo</h3>
          <p className="break-all font-mono text-xs text-muted-foreground">{game.filePath}</p>
          <p className="text-xs text-muted-foreground">
            Metadatos obtenidos: {game.metadataFetchedAt ? new Date(game.metadataFetchedAt).toLocaleDateString() : 'nunca'}
          </p>
        </section>
      </div>
    </aside>
  )
}
