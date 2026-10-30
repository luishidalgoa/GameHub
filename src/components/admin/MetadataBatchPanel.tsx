'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import {
  BATCH_MODES, FIELD_SCOPES, MODE_FIELDS, SCOPE_LABEL,
  effectiveFields, fieldCategory, fieldHint, fieldLabel, fieldSubgroup, reachOf, runFields,
  type BatchField, type BatchMode, type FieldScope, type Reach,
} from '@/lib/metadata/scope'
import { AdminButton } from '@/components/admin/AdminButton'

const AUTO_THRESHOLD   = 68
const REVIEW_THRESHOLD = 40

interface PlatformOpt { slug: string; name: string }

interface PreviewState {
  games: number | null
  fields?: number
  skippedUnfindable: number
  /** For the quality pass: how many games are low quality in each field. */
  breakdown?: { cover: number; coverUnmeasured: number; description: number; screenshots: number }
}

// Shape returned by GET /api/admin/jobs/active
interface JobState {
  id: number
  status: 'running' | 'done' | 'failed' | 'cancelled'
  total: number
  processed: number
  applied: number
  skipped: number
  failed: number
  lastTitle: string | null
  message: string | null
}

// What each mode does, in the words an admin would use. Shown under the choice and on hover.
const MODE_COPY: Record<BatchMode, { label: string; line: string }> = {
  'missing': {
    label: 'Sin metadatos',
    line: 'Juegos sin ficha que aún no se han resuelto: nunca buscados, o con un reintento ya vencido. Lo que ya tiene ficha no se toca.',
  },
  'fill': {
    label: 'Con huecos',
    line: 'Juegos con ficha y algún campo vacío. Solo rellena los campos vacíos que elijas; lo que ya tiene valor y lo que fijaste a mano no cambia.',
  },
  'redo': {
    label: 'Rehacer todo',
    line: 'Todos los juegos visibles. Vuelve a buscar en las fuentes y reemplaza lo automático en los campos que elijas. Lo que fijaste a mano se conserva.',
  },
  'wrong-provider': {
    label: 'Proveedor incorrecto',
    line: 'Juegos con algún dato de una fuente fuera de la cadena de su plataforma. Solo rehace esos campos; los que ya vienen de una fuente correcta no se tocan.',
  },
  'quality': {
    label: 'Mejorar calidad',
    line: 'Rehace solo los campos de baja calidad: portadas pequeñas frente a la caja, descripciones de menos de 120 caracteres o con menos de 3 capturas. Lo que ya está bien no se toca.',
  },
  'popularity': {
    label: 'Popularidad',
    line: 'Actualiza en RAWG cuántos usuarios tienen cada juego y su valoración. Alimenta las recomendaciones.',
  },
  'autocomplete-scores': {
    label: 'Nota automática',
    line: 'Pone la nota a los juegos que no tienen ninguna, con la cadena RAWG → Metacritic → LaunchBox.',
  },
}

/** The fields of one category, split under their sub-headings, in catalogue order. */
function subgroupsOf(fields: readonly BatchField[]): [string, BatchField[]][] {
  const out = new Map<string, BatchField[]>()
  for (const f of fields) {
    const heading = fieldSubgroup(f) ?? ''
    out.set(heading, [...(out.get(heading) ?? []), f])
  }
  return [...out.entries()]
}

const REACH_LEGEND = 'Completo · solo los huecos · solo baja calidad · no aplica'

function ReachMark({ reach }: { reach: Reach }) {
  if (reach === 'all') return <span aria-label="completo" className="inline-block h-2 w-2 rounded-full bg-primary" />
  if (reach === 'gaps') return <span aria-label="solo los huecos" className="inline-block h-2 w-2 rounded-full border border-primary" />
  if (reach === 'quality') return <span aria-label="solo baja calidad" className="inline-flex h-2 w-2 overflow-hidden rounded-full border border-primary"><span className="w-1/2 bg-primary" /></span>
  return <span aria-label="no aplica" className="text-xs leading-none text-muted-foreground">–</span>
}

/**
 * A button that opens a menu under it; closes on outside click, Escape or resize.
 * The menu stays inside the viewport: it opens to the side and above or below whichever
 * has room, and never grows past the screen.
 */
function OptionsMenu({ label, disabled, children }: { label: ReactNode; disabled?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<{ right: boolean; up: boolean; maxH: number }>({ right: false, up: false, maxH: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Measure before paint, so the menu never shows in the wrong place.
  useLayoutEffect(() => {
    if (!open) return
    const btn = ref.current?.getBoundingClientRect()
    const menu = menuRef.current
    if (!btn || !menu) return
    const margin = 8
    // scrollHeight is the full content height, even when a previous maxHeight clips it.
    const width = menu.offsetWidth
    const right = btn.left + width > window.innerWidth - margin && btn.right - width >= margin
    const spaceBelow = window.innerHeight - btn.bottom - margin
    const spaceAbove = btn.top - margin
    const up = menu.scrollHeight > spaceBelow && spaceAbove > spaceBelow
    setPlace({ right, up, maxH: Math.max(0, up ? spaceAbove : spaceBelow) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  return (
    <div ref={ref} className="relative flex-1 min-w-[160px] xl:flex-none">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-secondary px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-60"
      >
        <span className="min-w-0 truncate">{label}</span>
        {/* A plain caret: the trigger says that it opens, nothing more. */}
        <span aria-hidden className={cn('h-0 w-0 flex-shrink-0 border-x-[5px] border-x-transparent border-t-[6px] border-t-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{ maxHeight: place.maxH || undefined, maxWidth: 'calc(100vw - 16px)' }}
          className={cn(
            'absolute z-30 w-[26rem] overflow-y-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl',
            place.right ? 'right-0' : 'left-0',
            place.up ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** A checkbox that can show the mixed state: some of its fields chosen, not all. */
function GroupCheck({ checked, mixed, onChange, disabled, label }: {
  checked: boolean
  mixed: boolean
  onChange: () => void
  disabled?: boolean
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed }, [mixed])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      aria-label={label}
      className="accent-primary"
    />
  )
}

/** One setting: a native checkbox, its name, and a line saying what it changes. */
function Setting({ label, detail, checked, onChange, disabled }: {
  label: string
  detail: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={cn('grid cursor-pointer grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 select-none rounded-md px-1 py-1 transition-colors hover:bg-accent/40', disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent')}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled} className="mt-0.5 accent-primary" />
      <span className="text-sm text-foreground">{label}</span>
      <span className="col-start-2 text-xs leading-snug text-muted-foreground">{detail}</span>
    </label>
  )
}

export function MetadataBatchPanel({ platforms = [] }: { platforms?: PlatformOpt[] }) {
  const t = useTranslations('MetadataBatch')
  const [job, setJob]               = useState<JobState | null>(null)
  const [mode, setMode]             = useState<BatchMode>('missing')
  // The fields the pass writes: inside what the mode allows, the admin picks them.
  const [fields, setFields]         = useState<BatchField[]>([...MODE_FIELDS.missing])
  const [preview, setPreview]       = useState<PreviewState | null>(null)
  const [popularityRedo, setPopularityRedo] = useState(false)
  // The quality pass's minimum cover size, as a multiple of the platform box (the slider).
  const [coverMinScale, setCoverMinScale] = useState(2)
  // Covers still waiting to be measured, and whether a measurement is running now.
  const [measureLeft, setMeasureLeft] = useState<number | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [platform, setPlatform]     = useState('')
  const [respectPinned, setRespectPinned]   = useState(true)
  const [starting, setStarting]     = useState(false)
  const [withScores, setWithScores] = useState(true)
  const [logLines, setLogLines]     = useState<string[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval>>()
  const logRef  = useRef<HTMLDivElement>(null)

  // What the pass will write: the chosen fields, less the ones its switches turn off.
  const selected = runFields(mode, fields, { withTrailers: true, withScores })
  const selectedKey = selected.join(',')
  // Whether a setting applies follows the fields chosen, not the switch it controls.
  const chosen = effectiveFields(mode, fields)
  const coversChosen = chosen.includes('cover')
  const scoresChosen = chosen.includes('score') || chosen.includes('metacritic')

  useEffect(() => {
    // Only the newest request may set the count: an older response must not overwrite it.
    // The slider waits a moment, so a drag asks once at the end, not at every step.
    let current = true
    const timer = setTimeout(() => {
      const q = new URLSearchParams({ mode, fields: selectedKey, withScores: String(withScores), popularityRedo: String(popularityRedo) })
      if (mode === 'quality') q.set('coverMinScale', String(coverMinScale))
      if (platform) q.set('platformSlug', platform)
      fetch(`/api/admin/metadata/batch/preview?${q}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (current) setPreview(data) })
        .catch(() => { if (current) setPreview(null) })
    }, 250)
    return () => { current = false; clearTimeout(timer) }
  }, [mode, platform, selectedKey, withScores, popularityRedo, coverMinScale, refreshKey])

  // How many covers still wait to be measured, for the platform chosen.
  useEffect(() => {
    if (mode !== 'quality') return
    let alive = true
    fetch(`/api/admin/covers/measure${platform ? `?platform=${encodeURIComponent(platform)}` : ''}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { remaining: number } | null) => { if (alive && d) setMeasureLeft(d.remaining) })
      .catch(() => { /* the count is a hint: the button still works */ })
    return () => { alive = false }
  }, [mode, platform, refreshKey])

  // Measuring reads the stored covers in turns until none is left, reporting after each turn.
  const measure = async () => {
    setMeasuring(true)
    try {
      for (;;) {
        const res = await fetch('/api/admin/covers/measure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: platform || undefined }),
        })
        if (!res.ok) break
        const d = await res.json() as { measured: number; unreadable: number; remaining: number }
        setMeasureLeft(d.remaining)
        setRefreshKey(k => k + 1)
        if (d.remaining === 0 || d.measured + d.unreadable === 0) break
      }
    } finally {
      setMeasuring(false)
    }
  }

  const chooseMode = (next: BatchMode) => {
    setMode(next)
    setFields([...MODE_FIELDS[next]])
  }

  // A field the mode does not allow cannot be chosen; the last one chosen stays chosen.
  const toggleField = (f: BatchField) => {
    if (!MODE_FIELDS[mode].includes(f)) return
    setFields(cur => {
      const next = cur.includes(f) ? cur.filter(x => x !== f) : MODE_FIELDS[mode].filter(x => x === f || cur.includes(x))
      return runFields(mode, next, { withTrailers: true, withScores: true }).length > 0 ? next : cur
    })
  }

  // The whole category at once: all its allowed fields, or none of them.
  const toggleGroup = (c: FieldScope) => {
    const allowed = MODE_FIELDS[mode].filter(f => fieldCategory(f) === c)
    const allChosen = allowed.every(f => fields.includes(f))
    setFields(cur => {
      const next = allChosen
        ? cur.filter(f => !allowed.includes(f))
        : MODE_FIELDS[mode].filter(f => cur.includes(f) || allowed.includes(f))
      return runFields(mode, next, { withTrailers: true, withScores: true }).length > 0 ? next : cur
    })
  }

  const running = job?.status === 'running'

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/jobs/active?type=metadata')
      const data = await res.json()
      setJob(data.job ?? null)
      if (Array.isArray(data.log) && data.log.length) setLogLines(data.log)
    } catch { /* transient — keep last state */ }
  }, [])

  // Follow the log only inside its own box, and only while the admin is already
  // at the bottom. The previous scrollIntoView() dragged the whole PAGE down on
  // every poll, so you couldn't read anything else while a job ran; scrolling up
  // in the log now also stops the follow until you come back to the bottom.
  useEffect(() => {
    const el = logRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 40) el.scrollTop = el.scrollHeight
  }, [logLines])

  // Poll while a job is running; also fetch once on mount so we pick up a job
  // that's already in progress when you return to the dashboard.
  useEffect(() => {
    fetchJob()
    pollRef.current = setInterval(fetchJob, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchJob])

  const start = async () => {
    if (running || starting || selected.length === 0) return
    setStarting(true)
    try {
      await fetch('/api/admin/jobs/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          platformSlug: platform || undefined,
          fields: selected,
          respectPinned,
          withScores,
          popularityRedo: mode === 'popularity' ? popularityRedo : undefined,
          coverMinScale: mode === 'quality' ? coverMinScale : undefined,
        }),
      })
      await fetchJob()
    } finally {
      setStarting(false)
    }
  }

  const stop = async () => {
    await fetch('/api/admin/jobs/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metadata' }),
    })
    await fetchJob()
  }

  const pct = job && job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0

  // What the pass would touch, as one line (the same count the run uses).
  const previewLine: ReactNode = preview === null ? null
    : preview.games === null
      ? 'Se sabrá al empezar: depende de la fuente de cada juego.'
      : <>Tocará <b>{preview.games.toLocaleString('es-ES')}</b> juegos{preview.fields !== undefined ? <> · <b>{preview.fields.toLocaleString('es-ES')}</b> campos vacíos</> : null}.</>

  const allowedNow = MODE_FIELDS[mode]
  // The quality pass's breakdown: which fields are low quality, how many games each.
  const breakdownLine: ReactNode = mode === 'quality' && preview?.breakdown ? (
    <>Portada pequeña <b>{preview.breakdown.cover.toLocaleString('es-ES')}</b> · sin medir <b>{preview.breakdown.coverUnmeasured.toLocaleString('es-ES')}</b> · descripción <b>{preview.breakdown.description.toLocaleString('es-ES')}</b> · capturas <b>{preview.breakdown.screenshots.toLocaleString('es-ES')}</b></>
  ) : null

  const modeRows = BATCH_MODES.map(m => {
    const active = mode === m
    return (
      <button
        key={m}
        type="button"
        onClick={() => chooseMode(m)}
        title={MODE_COPY[m].line}
        aria-pressed={active}
        className={cn(
          'grid w-full grid-cols-[1fr_repeat(4,minmax(0,3.5rem))] items-center gap-x-1 rounded-md border-l-2 px-2 py-1.5 text-left transition-colors',
          active ? 'border-primary bg-accent text-foreground' : 'border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        )}
      >
        <span className="truncate text-sm">{MODE_COPY[m].label}</span>
        {FIELD_SCOPES.map(c => (
          <span key={c} className="flex justify-center"><ReachMark reach={reachOf(m, c)} /></span>
        ))}
      </button>
    )
  })

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">

      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{t('title')}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('description', { threshold: AUTO_THRESHOLD, review: REVIEW_THRESHOLD, max: AUTO_THRESHOLD - 1 })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 xl:flex-shrink-0">
          {/* Platform selector */}
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value)}
            disabled={running}
            title={t('platformHint')}
            className="flex-1 min-w-[140px] xl:flex-none rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          >
            <option value="">{t('allPlatforms')}</option>
            {platforms.map(p => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>

          {/* The menu: which games, which fields, which settings. */}
          <OptionsMenu
            label={<>{MODE_COPY[mode].label} <span className="text-muted-foreground">· {selected.length} campos</span></>}
            disabled={running}
          >
            {/* Juegos: the mode decides who is selected, and what it may touch at all. */}
            <div className="grid grid-cols-[1fr_repeat(4,minmax(0,3.5rem))] items-end gap-x-1 px-2 pb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Juegos</span>
              {FIELD_SCOPES.map(c => (
                <span key={c} className="truncate text-center text-[10px] font-medium text-muted-foreground" title={SCOPE_LABEL[c]}>{SCOPE_LABEL[c]}</span>
              ))}
            </div>
            <div className="space-y-0.5">{modeRows}</div>
            <p className="px-2 pt-1.5 text-[11px] text-muted-foreground">{REACH_LEGEND}</p>

            <div className="my-3 border-t border-border" />

            {/* Qué actualizar: inside what the mode allows, the admin picks the fields. */}
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Qué actualizar</p>
            <div className="space-y-3 px-2">
              {FIELD_SCOPES.map(c => {
                const allowed = allowedNow.filter(f => fieldCategory(f) === c)
                if (allowed.length === 0) return null
                const chosenHere = allowed.filter(f => selected.includes(f)).length
                return (
                  <div key={c}>
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <GroupCheck
                        checked={chosenHere === allowed.length}
                        mixed={chosenHere > 0 && chosenHere < allowed.length}
                        onChange={() => toggleGroup(c)}
                        disabled={running}
                        label={`Todo ${SCOPE_LABEL[c]}`}
                      />
                      {SCOPE_LABEL[c]}
                      <span className="text-xs font-normal text-muted-foreground tabular-nums">{chosenHere} de {allowed.length}</span>
                    </label>
                    {subgroupsOf(allowed).map(([heading, list]) => (
                    <div key={heading || 'all'} className="mt-1.5 pl-6">
                      {heading && <p className="mb-1 text-[11px] text-muted-foreground">{heading}</p>}
                      <div className="flex flex-wrap gap-1.5">
                      {list.map(f => {
                        const on = selected.includes(f)
                        return (
                          <label
                            key={f}
                            title={fieldHint(f)}
                            className={cn(
                              'inline-flex cursor-pointer select-none items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                              on ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-primary/30',
                              running && 'cursor-not-allowed opacity-50',
                            )}
                          >
                            <input type="checkbox" checked={on} onChange={() => toggleField(f)} disabled={running} className="accent-primary" />
                            {fieldLabel(f)}
                          </label>
                        )
                      })}
                      </div>
                    </div>
                    ))}
                  </div>
                )
              })}
            </div>

            {mode === 'quality' && selected.includes('cover') && (
              <div className="mt-3 space-y-1.5 rounded-md bg-secondary px-3 py-2">
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-foreground">Calidad mínima de la portada</span>
                  <span className="tabular-nums text-muted-foreground">{coverMinScale}× la caja</span>
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.25}
                  value={coverMinScale}
                  onChange={e => setCoverMinScale(Number(e.target.value))}
                  disabled={running}
                  aria-label="Calidad mínima de la portada"
                  className="w-full accent-primary"
                />
                <p className="text-[11px] text-muted-foreground">Una portada más pequeña que esto se rehace. Por defecto, 2× la caja de su plataforma.</p>
              </div>
            )}

            <div className="my-3 border-t border-border" />

            <p className="px-2 pb-1 text-xs font-medium text-foreground">Ajustes</p>
            <div className="space-y-1">
              <Setting
                label="Respetar fijadas"
                detail="Conserva las portadas que elegiste a mano, también al rehacer todo."
                checked={respectPinned}
                onChange={setRespectPinned}
                disabled={running || !coversChosen}
              />
              {(mode === 'missing' || mode === 'fill' || mode === 'redo') && (
                <Setting
                  label="Buscar nota"
                  detail="Calcula también la nota durante el pase, además de la ficha."
                  checked={withScores}
                  onChange={setWithScores}
                  disabled={running || !scoresChosen}
                />
              )}
              {mode === 'popularity' && (
                <Setting
                  label={t('popularityRedo')}
                  detail="Vuelve a pedir a RAWG los juegos que ya consultó."
                  checked={popularityRedo}
                  onChange={setPopularityRedo}
                  disabled={running}
                />
              )}
            </div>
            {mode === 'quality' && (
              <div className="mt-3 space-y-1.5 rounded-md bg-secondary px-3 py-2">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-foreground">Portadas por medir</span>
                  <span className="tabular-nums text-muted-foreground">{measureLeft === null ? '…' : measureLeft.toLocaleString('es-ES')}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Medir es leer el tamaño real de cada portada ya guardada, sin volver a pedirla a los proveedores. Hasta medirla, una portada cuenta como baja calidad.
                </p>
                <AdminButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={measure}
                  disabled={measuring || running || measureLeft === 0}
                >
                  {measuring ? 'Midiendo…' : 'Medir portadas'}
                </AdminButton>
              </div>
            )}
            <div className="mt-3 flex items-baseline justify-between gap-3 rounded-md bg-secondary px-3 py-2">
              <span className="text-xs text-muted-foreground">Vista previa</span>
              <span className="text-right text-xs text-foreground">
                {previewLine}
                {breakdownLine && <span className="mt-1 block text-[11px] text-muted-foreground">{breakdownLine}</span>}
              </span>
            </div>
          </OptionsMenu>

          {running ? (
            <AdminButton
              variant="danger"
              size="md"
              onClick={stop}
              className="flex-1 min-w-[120px] xl:flex-none"
            >
              {t('stop')}
            </AdminButton>
          ) : (
            <AdminButton
              variant="primary"
              size="md"
              onClick={start}
              disabled={starting || selected.length === 0}
              className="flex-1 min-w-[120px] xl:flex-none"
            >
              {starting ? 'Iniciando…' : job && job.status !== 'running' ? t('runAgain') : t('start')}
            </AdminButton>
          )}
        </div>
      </div>

      {/* The mode in words, and what the pass would touch: full width, under the controls */}
      <div className="text-xs text-muted-foreground leading-relaxed">
        <p>{MODE_COPY[mode].line}</p>
        {preview && (
          <p className="mt-1 text-foreground">
            {previewLine}
            {preview.skippedUnfindable > 0 && <span className="text-muted-foreground"> No se tocan {preview.skippedUnfindable} sin fuente.</span>}
          </p>
        )}
      </div>

      {/* Running progress (persisted — survives navigation / reload) */}
      {running && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {job!.total > 0 ? `${job!.processed} / ${job!.total}` : t('processing')}
              {job!.lastTitle && <span className="text-foreground/60 truncate max-w-[220px]">· {job!.lastTitle}</span>}
            </span>
            <span className="flex gap-3 tabular-nums">
              <span className="text-green-400">{job!.applied} aplicados</span>
              <span className="text-amber-400">{job!.skipped} omitidos</span>
              <span className="text-red-400">{job!.failed} fallidos</span>
            </span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            {job!.total > 0 ? (
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            ) : (
              <div className="h-full bar-indeterminate" />
            )}
          </div>
        </div>
      )}

      {/* Live terminal-style log (like the ROM scanner) */}
      {running && logLines.length > 0 && (
        <div ref={logRef} className="bg-black/40 rounded-lg p-4 h-56 overflow-y-auto font-mono text-xs text-green-400 leading-relaxed">
          {logLines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap">{line}</div>
          ))}
          <span className="animate-pulse">█</span>
        </div>
      )}

      {/* Finished summary */}
      {job && job.status !== 'running' && (
        <div className="space-y-3">
          {job.status === 'failed' && job.message && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2">
              {job.message}
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label={t('applied')} value={job.applied} tone="text-green-400" />
            <SummaryCard label={t('skipped')} value={job.skipped} tone="text-amber-400" />
            <SummaryCard label={t('failed')} value={job.failed} tone="text-red-400" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-border bg-secondary/50 px-4 py-3">
      <p className={cn('text-xl font-semibold tabular-nums', tone)}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
