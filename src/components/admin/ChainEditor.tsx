'use client'

import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AdminButton } from '@/components/admin/AdminButton'
import { CHAIN_FIELDS, COVER_MIN_SCALE, optionsFor, type ChainField, type ChainOrigin, type ProviderChains } from '@/lib/metadata/chains'

// The chains of sources, edited as a flow: each kind of data starts at the game and asks
// its sources one after another. The first that answers wins. Every source is a step you
// can open, change, move or remove; the cover steps show the size check between them.

export interface PlatformChainRow {
  slug: string
  name: string
  override: Partial<ProviderChains> | null
  effective: ProviderChains
  origin: Record<ChainField, ChainOrigin>
}

const FIELD_COPY: Record<ChainField, { label: string; hint: string }> = {
  cover:       { label: 'Portada',     hint: 'La caja del juego. Una imagen menor que la caja × 2 cuenta como baja calidad: se prueba la siguiente fuente.' },
  info:        { label: 'Ficha',       hint: 'Desarrollador, editora, año y género. Si una fuente no tiene al juego, se prueba la siguiente.' },
  description: { label: 'Descripción', hint: 'La primera fuente que tenga texto.' },
  screenshots: { label: 'Capturas',    hint: 'La primera fuente que tenga capturas. No se busca en otra si la primera no tiene ninguna.' },
  banner:      { label: 'Banner',      hint: 'La imagen ancha del juego. Se usa la primera fuente que la tenga, en el orden de la cadena.' },
  logo:        { label: 'Logo',        hint: 'El logo del juego con fondo transparente. Se usa la primera fuente que lo tenga.' },
}

const SOURCE_COPY: Record<string, { name: string; text: string }> = {
  launchbox:   { name: 'LaunchBox',          text: 'Base de datos de la plataforma. Busca por título.' },
  rawg:        { name: 'RAWG',               text: 'Busca por título y comprueba la consola.' },
  libretro:    { name: 'libretro',           text: 'Caja de la consola por nombre de fichero.' },
  steamgriddb: { name: 'SteamGridDB',        text: 'Imágenes de la comunidad, por título: portadas, banners y logos.' },
  steam:       { name: 'Steam',              text: 'Ficha de la tienda de Steam, por título exacto. Solo juegos que estén en Steam.' },
  nintendo:    { name: 'Tienda de Nintendo', text: 'Portada de la tienda. Solo Switch.' },
}

const ORIGIN_LABEL: Record<ChainOrigin, string> = {
  platform: 'Propia de la plataforma',
  builtin:  'Por defecto de la plataforma',
  global:   'Heredada del global',
}

type Chains = ProviderChains

export function ChainEditor({ global, platforms }: { global: Chains; platforms: PlatformChainRow[] }) {
  const [slug, setSlug] = useState(platforms[0]?.slug ?? '')
  const row = platforms.find(p => p.slug === slug) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">Cadena de fuentes</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Cada dato pide sus fuentes en orden y gana la primera que responde. Pulsa una fuente para cambiarla, moverla o quitarla.
          En la portada, cada fuente pasa por el control de calidad frente a la caja de la plataforma (× {COVER_MIN_SCALE}).
        </p>
      </div>

      <ChainBlock key="global" scope={{ kind: 'global' }} title="Por defecto" description="Para todas las plataformas que no tengan cadena propia." initial={global} />

      <div className="space-y-3 border-t border-border pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium">Por plataforma</h4>
            <p className="text-xs text-muted-foreground">Una cadena propia reemplaza la de por defecto solo para esa plataforma.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Plataforma</span>
            <select
              value={slug}
              onChange={e => setSlug(e.target.value)}
              className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {platforms.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          </label>
        </div>
        {row && (
          <ChainBlock
            key={row.slug}
            scope={{ kind: 'platform', slug: row.slug, hasOwn: row.override !== null }}
            title={row.name}
            description="Las fuentes que esta plataforma pide. Sin cadena propia, hereda la de por defecto."
            initial={row.effective}
            origin={row.origin}
          />
        )}
      </div>
    </div>
  )
}

type Scope = { kind: 'global' } | { kind: 'platform'; slug: string; hasOwn: boolean }

function ChainBlock({ scope, title, description, initial, origin }: {
  scope: Scope
  title: string
  description: string
  initial: Chains
  origin?: Record<ChainField, ChainOrigin>
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<Chains>(initial)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const slug = scope.kind === 'global' ? 'global' : scope.slug
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  // A new saved chain from the server replaces the draft (the draft is what was saved, after a refresh).
  const initialKey = JSON.stringify(initial)
  useEffect(() => { setDraft(JSON.parse(initialKey) as Chains) }, [initialKey])

  const save = async () => {
    setSaving(true)
    setMessage(null)
    const body = scope.kind === 'global'
      ? { scope: 'global', chains: draft }
      : { scope: 'platform', slug: scope.slug, chains: draft }
    const res = await fetch('/api/metadata/chains', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) {
      setMessage({ ok: true, text: 'Cadena guardada' })
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setMessage({ ok: false, text: data.error ?? 'No se pudo guardar' })
    }
  }

  const reset = async () => {
    if (scope.kind !== 'platform') return
    setSaving(true)
    const res = await fetch('/api/metadata/chains', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'platform', slug: scope.slug, chains: null }),
    })
    setSaving(false)
    if (res.ok) router.refresh()
    else setMessage({ ok: false, text: 'No se pudo restablecer' })
  }

  return (
    <section className="space-y-4" aria-label={`Cadena de ${title}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {message && (
            <span role="status" className={cn('text-xs', message.ok ? 'text-emerald-400' : 'text-destructive')}>{message.text}</span>
          )}
          {scope.kind === 'platform' && scope.hasOwn && (
            <AdminButton variant="danger" size="sm" type="button" onClick={reset} disabled={saving}>
              Usar la de por defecto
            </AdminButton>
          )}
          <AdminButton variant="primary" size="sm" type="button" onClick={save} disabled={saving || !dirty}>
            {saving ? 'Guardando…' : 'Guardar cadena'}
          </AdminButton>
        </div>
      </div>

      <div className="space-y-5">
        {CHAIN_FIELDS.map(field => (
          <Lane
            key={`${slug}-${field}`}
            slug={slug}
            field={field}
            chain={draft[field]}
            origin={origin?.[field]}
            onChange={next => setDraft(d => ({ ...d, [field]: next }))}
          />
        ))}
      </div>
    </section>
  )
}

function Lane({ slug, field, chain, origin, onChange }: {
  slug: string
  field: ChainField
  chain: string[]
  origin?: ChainOrigin
  onChange: (next: string[]) => void
}) {
  // The step open for editing: a position in the chain, or 'new' for an added source.
  const [open, setOpen] = useState<number | 'new' | null>(null)
  const options = optionsFor(field, slug) as readonly string[]
  const unused = options.filter(o => !chain.includes(o))
  const copy = FIELD_COPY[field]
  const isCover = field === 'cover'

  const choose = (position: number | 'new', source: string) => {
    if (position === 'new') {
      onChange([...chain, source])
      setOpen(chain.length)
      return
    }
    const at = chain.indexOf(source)
    const next = [...chain]
    if (at >= 0 && at !== position) {
      // Already in the chain elsewhere: the two steps trade places.
      next[at] = chain[position]
    }
    next[position] = source
    onChange(next)
  }
  const move = (position: number, to: number) => {
    const next = [...chain]
    ;[next[position], next[to]] = [next[to], next[position]]
    onChange(next)
    setOpen(to)
  }
  const remove = (position: number) => {
    onChange(chain.filter((_, i) => i !== position))
    setOpen(null)
  }

  const openSource = open !== null && open !== 'new' ? chain[open] : null

  return (
    <div className="grid gap-3 md:grid-cols-[11rem_1fr] md:items-start">
      <div>
        <p className="text-sm font-medium">{copy.label}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{copy.hint}</p>
        {origin && (
          <span className="mt-1.5 inline-block rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{ORIGIN_LABEL[origin]}</span>
        )}
      </div>

      <div className="min-w-0 space-y-3">
        <ol aria-label={`Orden de fuentes: ${copy.label}`} className="flex flex-wrap items-center gap-y-2">
          <li className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground">Juego</li>

          {chain.length === 0 && (
            <Fragment>
              <Link />
              <li className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground">Sin fuente</li>
            </Fragment>
          )}

          {chain.map((source, i) => (
            <Fragment key={`${source}-${i}`}>
              <Link />
              {isCover && <li className="px-1 text-[11px] text-muted-foreground">¿calidad suficiente?</li>}
              <li>
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                  className={cn(
                    'flex min-w-[10rem] flex-col rounded-md border px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    i === 0 ? 'border-primary/60 bg-primary/10' : 'border-border bg-secondary',
                    open === i && 'ring-1 ring-primary/50',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                    {SOURCE_COPY[source]?.name ?? source}
                    {i === 0 && <span className="text-[10px] uppercase tracking-wide text-primary">primera</span>}
                  </span>
                  <span className="text-[11px] leading-snug text-muted-foreground">{SOURCE_COPY[source]?.text}</span>
                </button>
              </li>
            </Fragment>
          ))}

          {unused.length > 0 && (
            <Fragment>
              <Link />
              <li>
                <button
                  type="button"
                  onClick={() => setOpen(open === 'new' ? null : 'new')}
                  aria-expanded={open === 'new'}
                  className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  + Añadir fuente
                </button>
              </li>
            </Fragment>
          )}

          <Link />
          <li className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground">
            {isCover ? 'Sin portada' : 'Sin dato'}
          </li>
        </ol>

        {open !== null && (
          <div
            role="group"
            aria-label={open === 'new' ? `Añadir fuente a ${copy.label}` : `Cambiar la fuente ${typeof open === 'number' ? open + 1 : ''} de ${copy.label}`}
            onKeyDown={e => { if (e.key === 'Escape') setOpen(null) }}
            className="space-y-2 rounded-md border border-border bg-card p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium">{open === 'new' ? 'Elige la fuente que se añade al final' : `Fuente ${(open as number) + 1}: ${SOURCE_COPY[openSource ?? '']?.name ?? ''}`}</p>
              {open !== 'new' && (
                <div className="flex gap-1.5">
                  <AdminButton variant="ghost" size="sm" type="button" disabled={open === 0} onClick={() => move(open as number, (open as number) - 1)}>Subir</AdminButton>
                  <AdminButton variant="ghost" size="sm" type="button" disabled={open === chain.length - 1} onClick={() => move(open as number, (open as number) + 1)}>Bajar</AdminButton>
                  <AdminButton variant="danger" size="sm" type="button" onClick={() => remove(open as number)}>Quitar</AdminButton>
                </div>
              )}
            </div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {(open === 'new' ? unused : options).map(source => {
                const current = open !== 'new' && chain[open as number] === source
                return (
                  <li key={source}>
                    <button
                      type="button"
                      aria-pressed={current}
                      onClick={() => {
                        choose(open as number | 'new', source)
                        if (open === 'new') setOpen(null)
                      }}
                      className={cn(
                        'flex w-full flex-col rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        current ? 'border-primary/60 bg-primary/10' : 'border-border hover:bg-accent',
                      )}
                    >
                      <span className="text-sm">{SOURCE_COPY[source]?.name ?? source}</span>
                      <span className="text-[11px] leading-snug text-muted-foreground">{SOURCE_COPY[source]?.text}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

/** The arrow between two steps: a short line, so the flow reads left to right. */
function Link() {
  return <li aria-hidden="true" className="mx-2 h-px w-4 self-center bg-border" />
}
