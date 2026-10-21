'use client'

import { useEffect, useRef, useState } from 'react'
import { CONSOLE_MODELS } from '@/lib/consoles'
import type { ConsoleHandle } from '@/lib/console-scene'
import type { Orientation, OrientationMap } from '@/lib/console-orientation'

const DEG = Math.PI / 180
const round = (n: number) => Math.round(n * 100) / 100

/**
 * Orients a console model by eye: turn each axis with its slider, hold the model
 * still and drag it to look around, or let it float as the home page does. The
 * result is saved and used by the home page straight away.
 */
export function ConsoleOrientationEditor({ saved }: { saved: OrientationMap }) {
  const models = Object.values(CONSOLE_MODELS)
  const [slug, setSlug] = useState(models[0].slug)
  const model = CONSOLE_MODELS[slug]
  const initial = (s: string): Orientation => saved[s] ?? CONSOLE_MODELS[s].baseRotation ?? [0, 0, 0]
  const [rot, setRot] = useState<Orientation>(initial(slug))
  const [spin, setSpin] = useState(true)
  const [stored, setStored] = useState<OrientationMap>(saved)
  const [status, setStatus] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<ConsoleHandle | null>(null)
  const latest = useRef({ rot, spin })
  latest.current = { rot, spin }

  // A new model: mount it with the orientation it has now.
  useEffect(() => {
    const el = host.current
    if (!el) return
    let cancelled = false
    handle.current = null
    const start = initial(slug)
    setRot(start)
    import('@/lib/console-scene').then(m => m.mountConsole(el, { url: model.file, baseRotation: start, axes: true }))
      .then(h => {
        if (cancelled) { h.dispose(); return }
        handle.current = h
        h.setSpin(latest.current.spin)
      })
      .catch(() => setStatus('No se pudo cargar el modelo'))
    return () => { cancelled = true; handle.current?.dispose(); handle.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const turn = (axis: 0 | 1 | 2, deg: number) => {
    const next = [...rot] as Orientation
    next[axis] = deg * DEG
    setRot(next)
    handle.current?.setBaseRotation(next)
    setStatus('')
  }
  const toggleSpin = (on: boolean) => { setSpin(on); handle.current?.setSpin(on) }

  const persist = async (rotation: Orientation | null) => {
    const res = await fetch('/api/admin/consoles/orientation', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, rotation }),
    })
    if (!res.ok) { setStatus('No se pudo guardar'); return }
    setStored((await res.json()).orientations)
    setStatus(rotation ? 'Guardado: la portada ya lo usa' : 'Vuelto al valor por defecto')
    if (!rotation) {
      const back = model.baseRotation ?? [0, 0, 0] as Orientation
      setRot(back)
      handle.current?.setBaseRotation(back)
    }
  }

  const axes = ['X', 'Y', 'Z'] as const
  const colors = ['text-red-400', 'text-green-400', 'text-blue-400']

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Orientación de los modelos 3D</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gira cada eje hasta que la consola mire de frente a la cámara y esté derecha. Con la
          animación en pausa puedes arrastrar el modelo para verlo desde cualquier lado.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {models.map(m => (
          <button key={m.slug} onClick={() => setSlug(m.slug)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${m.slug === slug ? 'border-primary bg-primary/15' : 'border-border hover:bg-secondary'}`}>
            {m.name}{stored[m.slug] ? ' •' : ''}
          </button>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-[1fr_320px]">
        <div ref={host} className="aspect-square w-full rounded-xl border border-border bg-black/40 md:aspect-[4/3]" />

        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          {axes.map((a, i) => (
            <div key={a}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className={`font-mono font-bold ${colors[i]}`}>{a}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{Math.round(rot[i] / DEG)}°</span>
              </div>
              <input type="range" min={-180} max={180} step={1} value={Math.round(rot[i] / DEG)}
                     onChange={e => turn(i as 0 | 1 | 2, Number(e.target.value))} className="w-full" />
              <div className="mt-1 flex gap-1">
                {[-90, 90, 180].map(d => (
                  <button key={d} onClick={() => turn(i as 0 | 1 | 2, ((Math.round(rot[i] / DEG) + d + 540) % 360) - 180)}
                          className="rounded border border-border px-2 py-0.5 text-xs hover:bg-secondary">{d > 0 ? '+' : ''}{d}°</button>
                ))}
              </div>
            </div>
          ))}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={spin} onChange={e => toggleSpin(e.target.checked)} />
            Animación de la portada (girar y flotar)
          </label>

          <div className="flex gap-2">
            <button onClick={() => persist(rot.map(round) as Orientation)}
                    className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Guardar</button>
            <button onClick={() => persist(null)} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">Restablecer</button>
          </div>
          {status && <p className="text-xs text-muted-foreground">{status}</p>}
          <p className="font-mono text-[11px] text-muted-foreground">[{rot.map(r => round(r)).join(', ')}] rad</p>
        </div>
      </div>
    </div>
  )
}
