'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ConsoleHandle } from '@/lib/console-scene'
import type { ViewerModel } from '@/lib/consoles'
import type { Orientation, OrientationMap } from '@/lib/console-orientation'
import { AdminButton } from '@/components/admin/AdminButton'

const DEG = Math.PI / 180
const round = (n: number) => Math.round(n * 100) / 100

export interface EditorPlatform {
  id: number
  slug: string
  name: string
  /** Modelo que se muestra: el subido o el de fábrica; null si la plataforma no tiene ninguno. */
  viewer: ViewerModel | null
  uploaded: boolean
  /** Póster en reposo de la tarjeta de consola, si ya se generó. */
  posterUrl: string | null
}

/**
 * Orienta el modelo 3D de cada plataforma a ojo: gira cada eje con su control, deja el modelo
 * quieto y arrástralo para verlo desde cualquier lado, o déjalo flotar como en la portada.
 * Se puede subir un GLB propio por plataforma; lo guardado lo usa la portada enseguida.
 */
export function ConsoleOrientationEditor({ platforms, saved }: { platforms: EditorPlatform[]; saved: OrientationMap }) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<number>(platforms[0]?.id ?? 0)
  const platform = platforms.find(p => p.id === selectedId) ?? platforms[0]
  const viewer = platform?.viewer ?? null
  const key = viewer?.slug ?? ''
  const [stored, setStored] = useState<OrientationMap>(saved)
  const initial = (): Orientation => (viewer && stored[viewer.slug]) || viewer?.baseRotation || [0, 0, 0]
  const [rot, setRot] = useState<Orientation>(initial)
  const [spin, setSpin] = useState(true)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<ConsoleHandle | null>(null)
  const latest = useRef({ rot, spin })
  latest.current = { rot, spin }

  // Un modelo nuevo (otra plataforma, o un GLB recién subido): se monta con su orientación.
  const viewerUrl = viewer?.file ?? ''
  useEffect(() => {
    const el = host.current
    if (!el || !viewerUrl) return
    let cancelled = false
    handle.current = null
    const start = (stored[key] ?? viewer?.baseRotation ?? [0, 0, 0]) as Orientation
    setRot(start)
    import('@/lib/console-scene')
      .then(m => m.mountConsole(el, { url: viewerUrl, baseRotation: start, axes: true }))
      .then(h => {
        if (cancelled) { h.dispose(); return }
        handle.current = h
        h.setSpin(latest.current.spin)
      })
      .catch(() => setStatus('No se pudo cargar el modelo'))
    return () => { cancelled = true; handle.current?.dispose(); handle.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerUrl])

  const turn = (axis: 0 | 1 | 2, deg: number) => {
    const next = [...rot] as Orientation
    next[axis] = deg * DEG
    setRot(next)
    handle.current?.setBaseRotation(next)
    setStatus('')
  }
  const toggleSpin = (on: boolean) => { setSpin(on); handle.current?.setSpin(on) }

  const persist = async (rotation: Orientation | null) => {
    if (!viewer) return
    const res = await fetch('/api/admin/consoles/orientation', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: viewer.slug, rotation }),
    })
    if (!res.ok) { setStatus('No se pudo guardar'); return }
    setStored((await res.json()).orientations)
    setStatus(rotation ? 'Guardado: la portada ya lo usa' : 'Vuelto al valor por defecto')
    if (!rotation) {
      const back = viewer.baseRotation ?? [0, 0, 0] as Orientation
      setRot(back)
      handle.current?.setBaseRotation(back)
    }
  }

  const upload = async (file: File) => {
    if (!platform) return
    setBusy(true)
    setStatus('Subiendo…')
    const form = new FormData()
    form.append('platformId', String(platform.id))
    form.append('file', file)
    const res = await fetch('/api/admin/consoles/model', { method: 'POST', body: form })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setStatus(data.error ?? 'No se pudo subir el modelo'); return }
    setStatus('Modelo subido')
    router.refresh()
  }

  const makePoster = async () => {
    if (!platform || !handle.current) return
    setBusy(true)
    setStatus('Generando póster…')
    try {
      const png = await handle.current.snapshot(512)
      const form = new FormData()
      form.append('platformId', String(platform.id))
      form.append('file', png, `${platform.slug}.png`)
      const res = await fetch('/api/admin/consoles/poster', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setStatus(data.error ?? 'No se pudo guardar el póster'); return }
      setStatus('Póster guardado')
      router.refresh()
    } catch {
      setStatus('No se pudo generar el póster')
    } finally {
      setBusy(false)
    }
  }

  const removeUpload = async () => {
    if (!platform) return
    setBusy(true)
    const res = await fetch('/api/admin/consoles/model', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platformId: platform.id }),
    })
    setBusy(false)
    if (!res.ok) { setStatus('No se pudo quitar el modelo'); return }
    setStatus('Modelo subido quitado')
    router.refresh()
  }

  const axes = ['X', 'Y', 'Z'] as const
  const colors = ['text-red-400', 'text-green-400', 'text-blue-400']
  const hasModel = !!viewer

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Modelos 3D de las plataformas</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Elige una plataforma, gira los ejes hasta que la consola mire de frente y esté derecha, y guarda.
          Cada plataforma puede tener su propio modelo (GLB).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={platform?.id ?? ''}
          onChange={e => { setSelectedId(Number(e.target.value)); setStatus('') }}
          aria-label="Plataforma"
          className="w-full rounded-md border border-border bg-secondary px-2.5 py-1.5 text-sm sm:w-80"
        >
          {platforms.map(p => {
            const orient = p.viewer && stored[p.viewer.slug]
            return (
              <option key={p.id} value={p.id}>
                {p.name}{orient ? ' •' : ''}{!p.viewer ? ' · sin modelo' : ''}
              </option>
            )
          })}
        </select>
      </div>

      {platform && (
        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <div className="relative">
            <div ref={host} className="aspect-square w-full rounded-xl border border-border bg-black/40 md:aspect-[4/3]" />
            {!hasModel && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl text-sm text-muted-foreground">
                Esta plataforma no tiene modelo. Sube un GLB para verla aquí.
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-card p-3 text-sm" aria-disabled={!hasModel}>
            <p className="font-medium">{platform.name}</p>

            {axes.map((a, i) => (
              <div key={a} className={hasModel ? '' : 'pointer-events-none opacity-40'}>
                <div className="mb-0.5 flex items-center justify-between text-xs">
                  <span className={`font-mono font-bold ${colors[i]}`}>{a}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">{Math.round(rot[i] / DEG)}°</span>
                </div>
                <input type="range" min={-180} max={180} step={1} value={Math.round(rot[i] / DEG)}
                       onChange={e => turn(i as 0 | 1 | 2, Number(e.target.value))} className="w-full" />
                <div className="mt-0.5 flex gap-1">
                  {[-90, 90, 180].map(d => (
                    <AdminButton key={d} type="button" variant="ghost" size="sm" onClick={() => turn(i as 0 | 1 | 2, ((Math.round(rot[i] / DEG) + d + 540) % 360) - 180)}>{d > 0 ? '+' : ''}{d}°</AdminButton>
                  ))}
                </div>
              </div>
            ))}

            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={spin} onChange={e => toggleSpin(e.target.checked)} />
              Animación de la portada
            </label>

            <div className="flex gap-2">
              <AdminButton variant="primary" size="sm" type="button" disabled={!hasModel || busy} onClick={() => persist(rot.map(round) as Orientation)}
                           className="flex-1">Guardar</AdminButton>
              <AdminButton variant="danger" size="sm" type="button" disabled={!hasModel || busy} onClick={() => persist(null)}>Restablecer</AdminButton>
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-medium">Modelo 3D</p>
              <p className="text-xs text-muted-foreground">
                {platform.uploaded ? 'Modelo subido para esta plataforma.' : hasModel ? 'Modelo de fábrica.' : 'Sin modelo todavía.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <label className={`cursor-pointer rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary ${busy ? 'pointer-events-none opacity-40' : ''}`}>
                  Subir .glb
                  <input
                    type="file"
                    accept=".glb,model/gltf-binary"
                    className="sr-only"
                    onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }}
                  />
                </label>
                {platform.uploaded && (
                  <AdminButton variant="danger" size="sm" type="button" onClick={removeUpload} disabled={busy}>Quitar el subido</AdminButton>
                )}
              </div>
            </div>

            {hasModel && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-medium">Póster</p>
                <p className="text-xs text-muted-foreground">
                  {platform.posterUrl ? 'Imagen en reposo de la tarjeta de consola.' : 'Sin póster: se usa el icono de la plataforma.'}
                </p>
                <AdminButton variant="secondary" size="sm" type="button" onClick={makePoster} disabled={busy}>
                  Generar póster desde el 3D
                </AdminButton>
              </div>
            )}

            {status && <p className="text-[11px] text-muted-foreground">{status}</p>}
            {hasModel && <p className="font-mono text-[10px] text-muted-foreground">[{rot.map(r => round(r)).join(', ')}] rad</p>}
          </div>
        </div>
      )}
    </div>
  )
}
