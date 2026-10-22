import { db } from '@/lib/db'
import { runMetadataBatch, type BatchEvent } from '@/lib/metadata/batch'
import { runScan } from '@/lib/scanner'
import { fetchGameArt } from '@/lib/art'
import { runAutomatic } from '@/lib/automatic'
import { scanBus } from '@/lib/scanner/events'
import { fillGameFacts, readyForWikidata } from '@/lib/metadata/wikidata'

// Background job runner. Jobs run DETACHED from any HTTP request (so navigating
// away never cancels them) and persist their progress to the Job table, so the
// dashboard can show where a job is when you return, and an interrupted job
// (e.g. server restart) is auto-resumed on boot.

export type JobType = 'metadata' | 'scan' | 'art'

export interface MetadataJobParams {
  mode?: 'missing' | 'fill' | 'redo' | 'wrong-provider' | 'popularity' | 'autocomplete-scores'
  popularityRedo?: boolean
  platformSlug?: string
  withCovers?: boolean
  withTrailers?: boolean
  withScores?: boolean
}
export interface ArtJobParams {
  platformSlug?: string
  /** Fetch again even for games already checked. */
  redo?: boolean
  /** Only games never checked, or checked before this instant (ISO): the ones that lack the newer categories. */
  checkedBefore?: string
}
export interface ScanJobParams {
  platformSlug?: string
}

// Active AbortControllers + a small in-memory log ring buffer per job, shared
// across route bundles via globalThis. The log is ephemeral (lives only in the
// running process — never persisted), so the dashboard can show a live
// terminal-style feed while polling, without bloating the DB.
const g = globalThis as typeof globalThis & {
  __jobControllers?: Map<number, AbortController>
  __jobLogs?: Map<number, string[]>
}
if (!g.__jobControllers) g.__jobControllers = new Map()
if (!g.__jobLogs) g.__jobLogs = new Map()
const controllers = g.__jobControllers
const jobLogs = g.__jobLogs

const LOG_MAX = 120   // keep only the most recent lines

function pushLog(jobId: number, line: string) {
  const buf = jobLogs.get(jobId) ?? []
  buf.push(line)
  if (buf.length > LOG_MAX) buf.splice(0, buf.length - LOG_MAX)
  jobLogs.set(jobId, buf)
  // Kept for good: the live buffer above only serves the last lines of this process.
  void db.jobLog.create({ data: { jobId, text: line } }).catch(() => {})
}

/** The scan's own events, written to its job log while it runs. */
function describeScanEvent(ev: { type: string; platform?: string; filePath?: string; isNew?: boolean; total?: number; added?: number; updated?: number; stale?: number; message?: string }): string | null {
  const name = (p?: string) => (p ? p.split(/[\\/]/).pop() : '')
  switch (ev.type) {
    case 'scan_start':      return '→ Escaneo iniciado'
    case 'platform_start':  return `→ Plataforma: ${ev.platform}`
    case 'file_found':      return `${ev.isNew ? '+ Nuevo' : '· Encontrado'}: ${name(ev.filePath)}`
    case 'platform_done':   return `✓ ${ev.platform} terminada`
    case 'scan_complete':   return `✓ Terminado: ${ev.total ?? 0} encontrados · ${ev.added ?? 0} añadidos · ${ev.updated ?? 0} actualizados · ${ev.stale ?? 0} sin fichero`
    case 'scan_error':      return `✗ Error: ${ev.message ?? 'desconocido'}`
    default:                return null
  }
}

/** Recent log lines for a job (newest last). Empty if none / process restarted. */
export function getJobLog(jobId: number): string[] {
  return jobLogs.get(jobId) ?? []
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/** The single active (running) job of a type, if any. */
export function getActiveJob(type: JobType) {
  return db.job.findFirst({ where: { type, status: 'running' }, orderBy: { id: 'desc' } })
}

/** Latest job of a type (running or finished) — for the dashboard summary. */
export function getLatestJob(type: JobType) {
  return db.job.findFirst({ where: { type }, orderBy: { id: 'desc' } })
}

/** Request cancellation of the running job of a type. */
export async function cancelJob(type: JobType): Promise<boolean> {
  const job = await getActiveJob(type)
  if (!job) return false
  controllers.get(job.id)?.abort()
  await db.job.update({
    where: { id: job.id },
    data: { status: 'cancelled', message: 'Cancelled', finishedAt: new Date() },
  }).catch(() => {})
  controllers.delete(job.id)
  return true
}

// ── Metadata job ────────────────────────────────────────────────────────────

async function rawgApiKey(): Promise<string | undefined> {
  const s = await db.setting.findUnique({ where: { key: 'rawg_api_key' } })
  return s?.value || process.env.RAWG_API_KEY || undefined
}

/**
 * Start (or resume) a metadata job. Returns the Job row id immediately; the work
 * continues in the background. Refuses to start a second metadata job if one is
 * already running.
 */
export async function startMetadataJob(params: MetadataJobParams, resumeJobId?: number): Promise<number> {
  if (!resumeJobId) {
    const existing = await getActiveJob('metadata')
    if (existing) return existing.id
  }

  const job = resumeJobId
    ? await db.job.update({ where: { id: resumeJobId }, data: { status: 'running', message: null } })
    : await db.job.create({
        data: { type: 'metadata', status: 'running', phase: 'metadata', params: JSON.stringify(params) },
      })

  const controller = new AbortController()
  controllers.set(job.id, controller)
  if (!resumeJobId) jobLogs.set(job.id, [])   // fresh start → clear any stale log

  // Throttle DB writes: persist at most every ~1.5s (plus the final flush).
  let lastWrite = 0
  let pending: BatchEvent | null = null
  const flush = async (ev: BatchEvent) => {
    await db.job.update({
      where: { id: job.id },
      data: {
        total:     ev.total ?? undefined,
        processed: ev.processed ?? undefined,
        applied:   ev.applied ?? undefined,
        skipped:   ev.skipped ?? undefined,
        failed:    ev.failed ?? undefined,
        ...(ev.cursorId != null ? { cursorId: ev.cursorId } : {}),
        ...(ev.title ? { lastTitle: ev.title } : {}),
      },
    }).catch(() => {})
  }

  const emit = (ev: BatchEvent) => {
    pending = ev
    // Append a terminal-style line to the in-memory log buffer.
    if (ev.type === 'start') {
      pushLog(job.id, `→ ${ev.total} game${ev.total === 1 ? '' : 's'} to process`)
    } else if (ev.type === 'applied') {
      const matched = ev.matchedTitle && ev.matchedTitle !== ev.title ? ` → ${ev.matchedTitle}` : ''
      const conf = ev.confidence != null ? ` (${ev.confidence}%)` : ''
      const tr = ev.trailerFound ? ' 🎬' : ''
      const sc = ev.score != null ? ` ★${ev.score}` : ''
      pushLog(job.id, `✓ [${ev.processed}/${ev.total}] ${ev.title}${matched}${conf}${tr}${sc}`)
    } else if (ev.type === 'skipped') {
      pushLog(job.id, `– [${ev.processed}/${ev.total}] ${ev.title}${ev.reason ? ` — ${ev.reason}` : ''}`)
    } else if (ev.type === 'failed' && ev.gameId) {
      pushLog(job.id, `✗ [${ev.processed}/${ev.total}] ${ev.title} — ${ev.reason ?? 'error'}`)
    }
    const now = Date.now()
    if (now - lastWrite >= 1500) {
      lastWrite = now
      void flush(ev)
    }
  }

  // Detached execution — deliberately NOT awaited by the caller.
  ;(async () => {
    try {
      const apiKey = await rawgApiKey()
      // Resume cursor: if this Job already has progress, continue past it.
      const fresh = await db.job.findUnique({ where: { id: job.id } })
      const resumeAfterId = fresh?.cursorId ?? undefined

      await runMetadataBatch({
        emit,
        signal: controller.signal,
        apiKey,
        mode: params.mode ?? 'missing',
        popularityRedo: params.popularityRedo ?? false,
        platformSlug: params.platformSlug,
        withCovers: params.withCovers ?? true,
        withTrailers: params.withTrailers ?? true,
        withScores: params.withScores ?? true,
        backfillTrailers: true,
        resumeAfterId,
      })

      if (pending) await flush(pending)
      // If it was aborted mid-run, leave status as-is (cancelJob set it).
      if (!controller.signal.aborted) {
        const f = await db.job.findUnique({ where: { id: job.id } })
        await db.job.update({
          where: { id: job.id },
          data: {
            status: 'done',
            message: `${f?.applied ?? 0} applied · ${f?.skipped ?? 0} skipped · ${f?.failed ?? 0} failed`,
            finishedAt: new Date(),
          },
        }).catch(() => {})
        // New metadata brings new matches: fetch the art of games not yet checked.
        void startArtJob({ platformSlug: params.platformSlug }).catch(() => {})
      }
    } catch (err) {
      await db.job.update({
        where: { id: job.id },
        data: { status: 'failed', message: err instanceof Error ? err.message : 'unknown error', finishedAt: new Date() },
      }).catch(() => {})
    } finally {
      controllers.delete(job.id)
    }
  })()

  return job.id
}

// ── Art job ───────────────────────────────────────────────────────────────────

/**
 * Start (or resume) the art job: for every game not yet checked, fetch its
 * LaunchBox backdrop and logo. Paced to be polite to LaunchBox, so the first run
 * over a large library takes hours; it resumes from its cursor after a restart.
 */
export async function startArtJob(params: ArtJobParams, resumeJobId?: number): Promise<number> {
  if (!resumeJobId) {
    const existing = await getActiveJob('art')
    if (existing) return existing.id
  }
  const job = resumeJobId
    ? await db.job.update({ where: { id: resumeJobId }, data: { status: 'running', message: null } })
    : await db.job.create({ data: { type: 'art', status: 'running', phase: 'art', params: JSON.stringify(params) } })

  const controller = new AbortController()
  controllers.set(job.id, controller)
  if (!resumeJobId) jobLogs.set(job.id, [])

  ;(async () => {
    try {
      const where = {
        isHidden: false, userHidden: false, missingSince: null,
        ...(params.redo ? {}
          : params.checkedBefore
            ? { OR: [{ artCheckedAt: null }, { artCheckedAt: { lt: new Date(params.checkedBefore) } }] }
            : { artCheckedAt: null }),
        ...(params.platformSlug ? { platform: { slug: params.platformSlug } } : {}),
      }
      const fresh = await db.job.findUnique({ where: { id: job.id } })
      const cursor = fresh?.cursorId ?? 0
      const games = await db.game.findMany({
        where: { ...where, id: { gt: cursor } },
        select: { id: true, title: true, fileName: true, launchboxId: true, metadataFetchedAt: true, metadataStatus: true, platform: { select: { slug: true } } },
        orderBy: { id: 'asc' },
      })
      const done = fresh?.processed ?? 0
      await db.job.update({ where: { id: job.id }, data: { total: done + games.length } })
      pushLog(job.id, `→ ${games.length} games to process`)

      let processed = done, applied = fresh?.applied ?? 0, skipped = fresh?.skipped ?? 0, failed = fresh?.failed ?? 0
      for (const g of games) {
        if (controller.signal.aborted) return
        processed++
        let line: string
        try {
          const outcome = await runAutomatic(() => fetchGameArt({
            id: g.id, title: g.title, fileName: g.fileName,
            launchboxId: g.launchboxId, platformSlug: g.platform.slug,
          }))
          if (outcome === 'applied') { applied++; line = `✓ [${processed}] ${g.title}` }
          else { skipped++; line = `– [${processed}] ${g.title} — ${outcome === 'no-match' ? 'no LaunchBox match' : 'no art'}` }
        } catch (err) {
          failed++
          line = `✗ [${processed}] ${g.title} — ${err instanceof Error ? err.message : 'error'}`
        }
        pushLog(job.id, line)
        // Facts LaunchBox did not give (developer, publisher, year, genre) come from Wikidata.
        if (!controller.signal.aborted) {
          const filled = readyForWikidata(g) ? await runAutomatic(() => fillGameFacts(g.id)).catch(() => [] as string[]) : []
          if (filled.length) pushLog(job.id, `  + ${filled.join(', ')} (Wikidata)`)
          await new Promise(r => setTimeout(r, 1100))
        }
        await db.job.update({
          where: { id: job.id },
          data: { processed, applied, skipped, failed, cursorId: g.id, lastTitle: g.title },
        }).catch(() => {})
        await new Promise(r => setTimeout(r, 600))
      }
      await db.job.update({
        where: { id: job.id },
        data: { status: 'done', message: `${applied} applied · ${skipped} skipped · ${failed} failed`, finishedAt: new Date() },
      }).catch(() => {})
    } catch (err) {
      await db.job.update({
        where: { id: job.id },
        data: { status: 'failed', message: err instanceof Error ? err.message : 'unknown error', finishedAt: new Date() },
      }).catch(() => {})
    } finally {
      controllers.delete(job.id)
    }
  })()

  return job.id
}

// ── Scan job ──────────────────────────────────────────────────────────────────

/**
 * Start a scan job. The scan itself already runs detached and streams progress
 * over the scan bus; here we persist a Job row so the dashboard can show "a scan
 * is running" on return. Scans are idempotent (upsert by filePath), so a resume
 * just re-runs the scan from the start.
 */
export async function startScanJob(params: ScanJobParams): Promise<number> {
  const existing = await getActiveJob('scan')
  if (existing) return existing.id

  const job = await db.job.create({
    data: { type: 'scan', status: 'running', phase: 'scanning', params: JSON.stringify(params) },
  })

  // The scan streams its events to the dashboard; the same events go to the job log,
  // so the scan can be followed after a reload.
  const onScanEvent = (ev: Parameters<typeof describeScanEvent>[0]) => {
    const line = describeScanEvent(ev)
    if (line) pushLog(job.id, line)
  }
  scanBus.on('scan', onScanEvent)

  ;(async () => {
    try {
      await runScan('manual', params.platformSlug, job.id)
      await db.job.update({
        where: { id: job.id },
        data: { status: 'done', phase: 'done', message: 'Scan complete', finishedAt: new Date() },
      }).catch(() => {})
    } catch (err) {
      await db.job.update({
        where: { id: job.id },
        data: { status: 'failed', message: err instanceof Error ? err.message : 'scan error', finishedAt: new Date() },
      }).catch(() => {})
    } finally {
      scanBus.off('scan', onScanEvent)
    }
  })()

  return job.id
}

// ── Resume on boot ──────────────────────────────────────────────────────────

let resumeAttempted = false

/**
 * On server start, pick up jobs that were left 'running' by a crash/restart and
 * continue them. Metadata jobs resume from their cursor; scans simply re-run
 * (idempotent). Safe to call multiple times — only acts once per process.
 */
export async function resumeInterruptedJobs(): Promise<void> {
  if (resumeAttempted) return
  resumeAttempted = true

  let stale: { id: number; type: string; params: string | null }[] = []
  try {
    stale = await db.job.findMany({
      where: { status: 'running' },
      select: { id: true, type: true, params: true },
    })
  } catch { return }   // table not migrated yet, etc.

  for (const j of stale) {
    const params = (() => { try { return j.params ? JSON.parse(j.params) : {} } catch { return {} } })()
    if (j.type === 'metadata') {
      await startMetadataJob(params, j.id).catch(() => {})
    } else if (j.type === 'art') {
      await startArtJob(params, j.id).catch(() => {})
    } else if (j.type === 'scan') {
      // Mark the old scan row finished and start a fresh one (scans are idempotent).
      await db.job.update({ where: { id: j.id }, data: { status: 'cancelled', message: 'Superseded by resume', finishedAt: new Date() } }).catch(() => {})
      await startScanJob(params).catch(() => {})
    }
  }
}
