import { randomBytes } from 'crypto'
import { db } from './db'

export type QueueStatus = 'waiting' | 'ready' | 'downloading' | 'done' | 'expired'

export interface QueueEntry {
  token:     string
  gameId:    number
  dlcId?:    number
  status:    QueueStatus
  position:  number
  createdAt: number
  readyAt?:  number
  expiresAt?: number
}

const TOKEN_TTL_MS = 15 * 60_000  // 15 min ready window
const STALE_MS     = 30 * 60_000  // remove done/expired after 30 min
const STUCK_DOWNLOAD_MS = 12 * 60 * 60_000  // free the slot of a downloading token that never finished

function generateToken(): string {
  return randomBytes(24).toString('base64url')
}

function toEntry(row: {
  token: string; gameId: number; dlcId: number | null;
  status: string; position: number;
  createdAt: bigint; readyAt: bigint | null; expiresAt: bigint | null
}): QueueEntry {
  return {
    token:     row.token,
    gameId:    row.gameId,
    dlcId:     row.dlcId ?? undefined,
    status:    row.status as QueueStatus,
    position:  row.position,
    createdAt: Number(row.createdAt),
    readyAt:   row.readyAt  ? Number(row.readyAt)  : undefined,
    expiresAt: row.expiresAt ? Number(row.expiresAt) : undefined,
  }
}

async function getMaxConcurrent(): Promise<number> {
  const s = await db.setting.findUnique({ where: { key: 'max_concurrent_downloads' } })
  const n = s ? parseInt(s.value, 10) : 1
  // Guard against a blank/non-numeric setting: parseInt('') is NaN, which would
  // otherwise reach `take: NaN` in promoteNext() and crash the whole enqueue.
  return Number.isFinite(n) && n > 0 ? n : 1
}

async function pruneStale(): Promise<void> {
  const now = BigInt(Date.now())
  const cutoff = now - BigInt(STALE_MS)

  await db.downloadToken.deleteMany({
    where: { status: { in: ['done', 'expired'] }, createdAt: { lt: cutoff } },
  })

  // Mark ready tokens whose window has closed
  await db.downloadToken.updateMany({
    where: { status: 'ready', expiresAt: { lt: now } },
    data:  { status: 'expired' },
  })

  // A downloading token whose connection died never gets markDone, and would
  // hold a slot forever. No real transfer lasts this long.
  await db.downloadToken.updateMany({
    where: { status: 'downloading', createdAt: { lt: now - BigInt(STUCK_DOWNLOAD_MS) } },
    data:  { status: 'expired' },
  })
}

async function recomputePositions(): Promise<void> {
  const waiting = await db.downloadToken.findMany({
    where:   { status: 'waiting' },
    orderBy: { createdAt: 'asc' },
  })
  for (let i = 0; i < waiting.length; i++) {
    await db.downloadToken.update({
      where: { token: waiting[i].token },
      data:  { position: i + 1 },
    })
  }
}

async function promoteNext(): Promise<void> {
  const max    = await getMaxConcurrent()
  const active = await db.downloadToken.count({ where: { status: { in: ['ready', 'downloading'] } } })
  const slots  = max - active
  if (slots <= 0) return

  const waiting = await db.downloadToken.findMany({
    where:   { status: 'waiting' },
    orderBy: { createdAt: 'asc' },
    take:    slots,
  })

  const now = BigInt(Date.now())
  for (const row of waiting) {
    await db.downloadToken.update({
      where: { token: row.token },
      data:  { status: 'ready', readyAt: now, expiresAt: now + BigInt(TOKEN_TTL_MS), position: 0 },
    })
  }

  if (waiting.length > 0) await recomputePositions()
}

// ── Public API ────────────────────────────────────────────────────────────────

export const MAX_WAITING = 200

export class QueueFullError extends Error {}

export async function enqueue(gameId: number, dlcId?: number): Promise<QueueEntry> {
  await pruneStale()

  const token        = generateToken()
  const waitingCount = await db.downloadToken.count({ where: { status: 'waiting' } })
  if (waitingCount >= MAX_WAITING) throw new QueueFullError('La cola de espera está llena. Inténtalo más tarde.')

  await db.downloadToken.create({
    data: {
      token,
      gameId,
      dlcId:     dlcId ?? null,
      status:    'waiting',
      position:  waitingCount + 1,
      createdAt: BigInt(Date.now()),
    },
  })

  await promoteNext()

  const updated = await db.downloadToken.findUnique({ where: { token } })
  return toEntry(updated!)
}

/** Enqueue a whole batch in one transaction and promote once, instead of once per file. */
export async function enqueueMany(items: Array<{ gameId: number; dlcId?: number }>, batchId: string | null = null): Promise<QueueEntry[]> {
  await pruneStale()
  const waitingCount = await db.downloadToken.count({ where: { status: 'waiting' } })
  if (waitingCount + items.length > MAX_WAITING) {
    throw new QueueFullError('La cola de espera no tiene sitio para todo el lote. Inténtalo más tarde.')
  }
  const now = Date.now()
  const rows = items.map((it, i) => ({
    token:     generateToken(),
    gameId:    it.gameId,
    dlcId:     it.dlcId ?? null,
    status:    'waiting',
    position:  waitingCount + i + 1,
    createdAt: BigInt(now + i),
    batchId,
  }))
  await db.$transaction(rows.map(r => db.downloadToken.create({ data: r })))
  // The rows are committed: a failure from here on must not hide them from the caller.
  await promoteNext().catch(err => console.error('[queue] promoteNext after batch failed:', err))
  const saved = await db.downloadToken.findMany({ where: { token: { in: rows.map(r => r.token) } } }).catch(() => [])
  const byToken = new Map(saved.map(r => [r.token, toEntry(r)]))
  return rows.map(r => byToken.get(r.token) ?? toEntry({ ...r, readyAt: null, expiresAt: null }))
}

/** Id for a new batch. Like a token, it is the only key the client keeps. */
export function newBatchId(): string {
  return generateToken()
}

/** Every file of a batch, in the order it was queued. */
export async function getBatch(batchId: string): Promise<QueueEntry[]> {
  await pruneStale()
  const rows = await db.downloadToken.findMany({ where: { batchId }, orderBy: { createdAt: 'asc' } })
  return rows.map(row => toEntry(row))
}

/** Cancel the files of a batch that are still waiting. Returns how many were removed. */
export async function cancelBatchWaiting(batchId: string): Promise<number> {
  const { count } = await db.downloadToken.deleteMany({ where: { batchId, status: 'waiting' } })
  if (count > 0) await recomputePositions()
  return count
}

export async function cancelWaiting(token: string): Promise<boolean> {
  const row = await db.downloadToken.findUnique({ where: { token } })
  if (!row || row.status !== 'waiting') return false
  await db.downloadToken.delete({ where: { token } })
  await recomputePositions()
  return true
}

export async function getEntry(token: string): Promise<QueueEntry | null> {
  await pruneStale()
  const row = await db.downloadToken.findUnique({ where: { token } })
  return row ? toEntry(row) : null
}

export async function markDownloading(token: string): Promise<boolean> {
  const row = await db.downloadToken.findUnique({ where: { token } })
  if (!row || row.status !== 'ready') return false
  await db.downloadToken.update({ where: { token }, data: { status: 'downloading' } })
  return true
}

export async function markDone(token: string): Promise<void> {
  await db.downloadToken.update({ where: { token }, data: { status: 'done' } }).catch(() => {})
  promoteNext().catch(() => {})
}

