'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Sparkles, StopCircle, CheckCircle2, XCircle, AlertTriangle, Loader2, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BATCH_MODES, FIELD_SCOPES, MODE_APPLIES, SCOPE_FIELD_COUNT, SCOPE_LABEL,
  effectiveScope, reachOf, runScope, type BatchMode, type FieldScope, type Reach,
} from '@/lib/metadata/scope'

const AUTO_THRESHOLD   = 68
const REVIEW_THRESHOLD = 40

interface PlatformOpt { slug: string; name: string }

interface PreviewState { games: number | null; fields?: number; skippedUnfindable: number }

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

/** What each category holds, shown on hover in its header. */
const SCOPE_HINT: Record<FieldScope, string> = {
  ficha:      'Título, descripción, género, desarrollador, editor, año y fecha',
  imagenes:   'Portada, fondo, logo, tile y capturas',
  notas:      'Nota, Metacritic, valoración y popularidad',
  multimedia: 'Tráiler de YouTube',
}

// One line per mode, so the choice reads without the manual: what it does, and to whom.
const MODE_TEXT: Record<BatchMode, string> = {
  'missing':              'Busca los juegos que no tienen ningún metadato. Lo que ya existe no se toca.',
  'fill':                 'Rellena solo los campos vacíos de cada juego. Nunca cambia lo que ya tiene valor ni lo que fijaste tú.',
  'redo':                 'Vuelve a buscar en todas las fuentes y sobrescribe lo automático. Lo que fijaste tú se conserva.',
  'wrong-provider':       'Vuelve a buscar solo en los juegos cuyos datos vienen de una fuente que no es la preferente de su plataforma.',
  'popularity':           'Recalcula la popularidad de RAWG (cuántos lo tienen y su valoración), que alimenta las recomendaciones.',
  'autocomplete-scores':  'Pone la nota a los juegos que no tienen ninguna, con la fuente configurada.',
}

function ReachDot({ reach }: { reach: Reach }) {
  if (reach === 'all') return <span className="inline-block h-2 w-2 rounded-full bg-violet-400" />
  if (reach === 'gaps') return <span className="inline-block h-2 w-2 rounded-full border border-violet-400" />
  return <span className="text-xs text-muted-foreground">—</span>
}

/**
 * A small button that opens a menu next to it; closes on outside click, Escape or resize.
 * The menu stays inside the viewport: it opens to the side and above or below whichever
 * has room, and never grows past the screen.
 */
function OptionsMenu({ label, disabled, children }: { label: string; disabled?: boolean; children: ReactNode }) {
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
    <div ref={ref} className="relative flex-1 min-w-[140px] xl:flex-none">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 bg-secondary border border-border rounded-md px-2.5 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-60"
      >
        <span className="flex items-center gap-2 min-w-0">
          <SlidersHorizontal className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{ maxHeight: place.maxH || undefined, maxWidth: 'calc(100vw - 16px)' }}
          className={cn(
            'absolute z-30 w-[26rem] overflow-y-auto rounded-md border border-border bg-card p-2 shadow-lg',
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

/** One setting: a checkbox with its name and, after a dot, what it changes. */
function Setting({ label, hint, checked, onChange, disabled, title }: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  title?: string
}) {
  return (
    <label
      title={title}
      className={cn('flex items-center gap-2 text-sm select-none cursor-pointer', disabled ? 'text-muted-foreground/50' : 'text-muted-foreground')}
    >
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled} className="accent-primary" />
      <span>{label}</span>
      {hint && <span className="text-xs text-muted-foreground/70">· {hint}</span>}
    </label>
  )
}

export function MetadataBatchPanel({ platforms = [] }: { platforms?: PlatformOpt[] }) {
  const t = useTranslations('MetadataBatch')
  const [job, setJob]               = useState<JobState | null>(null)
  const [mode, setMode]             = useState<BatchMode>('missing')
  // The categories the pass writes. A mode starts with every category it applies to.
  const [fields, setFields]         = useState<FieldScope[]>([...MODE_APPLIES.missing])
  const [preview, setPreview]       = useState<PreviewState | null>(null)
  const [popularityRedo, setPopularityRedo] = useState(false)
  const [platform, setPlatform]     = useState('')
  const [respectPinned, setRespectPinned]   = useState(true)
  const [starting, setStarting]     = useState(false)
  const [withScores, setWithScores] = useState(true)
  const [logLines, setLogLines]     = useState<string[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval>>()
  const logRef  = useRef<HTMLDivElement>(null)

  const MODE_LABEL: Record<BatchMode, string> = {
    'missing':             t('modeMissing'),
    'fill':                t('modeFill'),
    'redo':                t('modeRedo'),
    'wrong-provider':      t('modeWrongProvider'),
    'popularity':          t('modePopularity'),
    'autocomplete-scores': t('modeAutocompleteScores'),
  }

  // What the pass will write: the chosen categories, less the ones its switches turn off.
  const selected = runScope(mode, fields, { withTrailers: true, withScores })
  const selectedKey = selected.join(',')

  useEffect(() => {
    // Only the newest request may set the count: an older response must not overwrite it.
    let current = true
    const q = new URLSearchParams({ mode, fields: selectedKey, withScores: String(withScores), popularityRedo: String(popularityRedo) })
    if (platform) q.set('platformSlug', platform)
    fetch(`/api/admin/metadata/batch/preview?${q}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (current) setPreview(data) })
      .catch(() => { if (current) setPreview(null) })
    return () => { current = false }
  }, [mode, platform, selectedKey, withScores, popularityRedo])

  const chooseMode = (next: BatchMode) => {
    setMode(next)
    setFields([...MODE_APPLIES[next]])
  }

  // A category the mode does not apply to cannot be chosen; the last one stays chosen.
  const toggleField = (f: FieldScope) => {
    if (!MODE_APPLIES[mode].includes(f)) return
    setFields(cur => {
      const next = cur.includes(f) ? cur.filter(x => x !== f) : FIELD_SCOPES.filter(x => x === f || cur.includes(x))
      return effectiveScope(mode, next).length > 0 ? next : cur
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
      ? 'Cuántos juegos toca: se sabrá al empezar, porque depende de la fuente de cada juego.'
      : <>Tocará <b>{preview.games.toLocaleString('es-ES')}</b> juegos{preview.fields !== undefined ? <> · <b>{preview.fields.toLocaleString('es-ES')}</b> campos vacíos</> : null}.</>

  // Whether a setting applies follows the categories chosen, not the switch it controls.
  const chosen = effectiveScope(mode, fields)
  const coversChosen = chosen.includes('imagenes')
  const scoresChosen = chosen.includes('notas')

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">

      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-400 flex-shrink-0" />
            {t('title')}
          </h3>
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
            className="flex-1 min-w-[140px] xl:flex-none bg-secondary border border-border rounded-md px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          >
            <option value="">{t('allPlatforms')}</option>
            {platforms.map(p => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>

          {/* One menu for the games, the categories and the settings: compact, opened on demand. */}
          <OptionsMenu label={MODE_LABEL[mode]} disabled={running}>
            <p className="px-2.5 pb-0.5 text-xs text-muted-foreground">Qué actualizar</p>
            <div className="grid grid-cols-[1fr_repeat(4,4.5rem)] items-center px-2.5 pb-1">
              <span className="text-xs text-muted-foreground">Juegos</span>
              {FIELD_SCOPES.map(f => {
                const applies = MODE_APPLIES[mode].includes(f)
                const on = applies && selected.includes(f)
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleField(f)}
                    disabled={!applies}
                    aria-pressed={on}
                    title={`${SCOPE_LABEL[f]}: ${SCOPE_HINT[f]}`}
                    className={cn(
                      'rounded px-1 py-1 text-center text-xs leading-tight transition-colors',
                      on ? 'bg-violet-500/15 text-foreground' : 'text-muted-foreground',
                      applies ? 'hover:bg-accent/50' : 'opacity-30 cursor-not-allowed',
                    )}
                  >
                    <span className="block">{SCOPE_LABEL[f]}</span>
                    <span className="block text-[10px] opacity-70">{SCOPE_FIELD_COUNT[f]} campos</span>
                  </button>
                )
              })}
            </div>
            <div className="space-y-0.5">
              {BATCH_MODES.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => chooseMode(m)}
                  title={MODE_TEXT[m]}
                  aria-pressed={mode === m}
                  className={cn(
                    'grid w-full grid-cols-[1fr_repeat(4,4.5rem)] items-center rounded px-2.5 py-1.5 text-sm text-left transition-colors',
                    mode === m ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  <span className="truncate">{MODE_LABEL[m]}</span>
                  {FIELD_SCOPES.map(f => (
                    <span key={f} className="flex justify-center"><ReachDot reach={reachOf(m, f)} /></span>
                  ))}
                </button>
              ))}
            </div>
            <p className="px-2.5 pt-1.5 text-xs text-muted-foreground">● todo · ○ solo lo que falta · — no aplica</p>

            <div className="my-2 border-t border-border" />
            <p className="px-2.5 pb-1 text-xs text-muted-foreground">Ajustes</p>
            <div className="space-y-2 px-2.5">
              <Setting
                label="Respetar fijadas"
                hint="Portadas a mano"
                checked={respectPinned}
                onChange={setRespectPinned}
                disabled={running || !coversChosen}
                title="Si está activo, la portada que elegiste a mano no se cambia, ni siquiera al rehacer todo."
              />
              {(mode === 'missing' || mode === 'fill' || mode === 'redo') && (
                <Setting
                  label="Buscar nota"
                  hint="Pone la nota"
                  checked={withScores}
                  onChange={setWithScores}
                  disabled={running || !scoresChosen}
                  title={t('fetchScoresHint')}
                />
              )}
              {mode === 'popularity' && (
                <Setting
                  label={t('popularityRedo')}
                  checked={popularityRedo}
                  onChange={setPopularityRedo}
                  disabled={running}
                  title={t('popularityRedoHint')}
                />
              )}
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Vista previa <span className="text-xs text-muted-foreground/70">· cuenta lo que tocará</span></span>
                <span className="text-xs text-foreground text-right">{previewLine}</span>
              </div>
            </div>
            <p className="mt-2 px-1 text-xs text-muted-foreground leading-relaxed">{MODE_TEXT[mode]}</p>
          </OptionsMenu>

          {running ? (
            <button
              onClick={stop}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground text-sm rounded-md hover:bg-destructive/90 transition-colors flex-1 min-w-[120px] xl:flex-none"
            >
              <StopCircle className="w-4 h-4" />
              {t('stop')}
            </button>
          ) : (
            <button
              onClick={start}
              disabled={starting || selected.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm rounded-md transition-colors flex-1 min-w-[120px] xl:flex-none"
            >
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {job && job.status !== 'running' ? t('runAgain') : t('start')}
            </button>
          )}
        </div>
      </div>

      {/* Mode hint and what the pass would touch: full width, under the controls */}
      <div className="text-xs text-muted-foreground leading-relaxed">
        <p>{MODE_TEXT[mode]}</p>
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
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              {job!.total > 0 ? `${job!.processed} / ${job!.total}` : t('processing')}
              {job!.lastTitle && <span className="text-foreground/60 truncate max-w-[220px]">· {job!.lastTitle}</span>}
            </span>
            <span className="flex gap-3">
              <span className="text-green-400">✓ {job!.applied}</span>
              <span className="text-amber-400">⚠ {job!.skipped}</span>
              <span className="text-red-400">✗ {job!.failed}</span>
            </span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            {job!.total > 0 ? (
              <div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
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
            <SummaryCard icon={<CheckCircle2 className="w-4 h-4 text-green-400" />} label={t('applied')} value={job.applied} color="text-green-400" />
            <SummaryCard icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} label={t('skipped')} value={job.skipped} color="text-amber-400" />
            <SummaryCard icon={<XCircle className="w-4 h-4 text-red-400" />} label={t('failed')} value={job.failed} color="text-red-400" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-secondary/50 border border-border rounded-lg px-4 py-3 flex items-center gap-3">
      {icon}
      <div>
        <p className={cn('text-xl font-bold tabular-nums', color)}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
