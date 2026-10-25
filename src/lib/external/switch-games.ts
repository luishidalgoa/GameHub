import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { fileToTitle, toSortTitle } from '@/lib/utils'
import { parseLocks } from '@/lib/manual-fields'
import { extractSwitchTitleId } from '@/lib/scanner/titleid'
import { titleKey } from './match'

export const SWITCH_GAMES_SOURCE = 'switch-games'
const SOURCE_URL = 'https://raw.githubusercontent.com/Langegen/switch-games/main/switch_games.json'
const TIMEOUT_MS = 180_000
const CHUNK = 500

interface RawEntry {
  title?: string
  magnet?: string
  topic_id?: string
  url?: string
  size?: string
  title_id?: string
  image_format?: string
  year?: string
  genre?: string
  developer?: string
  publisher?: string
  cover?: string
  description?: string
}

export interface ExternalGameRow {
  source: string
  sourceKey: string
  platformId: number
  title: string
  titleId: string | null
  titleKey: string
  magnet: string
  sourceUrl: string
  size: string | null
  format: string | null
  hasDlc: boolean
  cover: string | null
  year: number | null
  genre: string | null
  developer: string | null
  publisher: string | null
  description: string | null
  syncedAt: Date
}

const TITLE_ID = /^[0-9a-f]{16}$/i

const text = (v: string | undefined): string | null => v?.trim() || null

export function toExternalRow(e: RawEntry, platformId: number, syncedAt: Date): ExternalGameRow | null {
  if (!e.title || !e.magnet || !e.topic_id || !e.url) return null
  const titleId = e.title_id?.trim()
  const year = Number.parseInt(e.year ?? '', 10)
  return {
    source: SWITCH_GAMES_SOURCE,
    sourceKey: e.topic_id,
    platformId,
    title: e.title.trim(),
    titleId: titleId && TITLE_ID.test(titleId) ? titleId.toUpperCase() : null,
    titleKey: titleKey(e.title),
    magnet: e.magnet,
    sourceUrl: e.url,
    size: text(e.size),
    format: text(e.image_format)?.toUpperCase() ?? null,
    hasDlc: /\bDLC\b/i.test(e.title),
    cover: text(e.cover),
    year: Number.isFinite(year) ? year : null,
    genre: text(e.genre),
    developer: text(e.developer),
    publisher: text(e.publisher),
    description: text(e.description),
    syncedAt,
  }
}

const UNIT_BYTES: Record<string, number> = { KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }

/** Tamaño de la fuente («7.45 GB») en bytes; 0 cuando no se puede leer. */
export function sizeBytes(size: string | null): bigint {
  const m = size?.match(/^([\d.,]+)\s*(KB|MB|GB|TB)$/i)
  if (!m) return BigInt(0)
  return BigInt(Math.round(Number(m[1].replace(',', '.')) * UNIT_BYTES[m[2].toUpperCase()]))
}

const DLC_TAIL = /\+\s*\d+\s*DLC.*$/i

function torrentGameData(row: ExternalGameRow, syncedAt: Date) {
  const title = fileToTitle(row.title).replace(DLC_TAIL, '').trim() || row.title.trim()
  return {
    title,
    sortTitle: toSortTitle(title),
    fileName: row.title,
    fileSize: sizeBytes(row.size),
    titleId: row.titleId,
    lastSeenAt: syncedAt,
  }
}

/**
 * Pone al día la lista de torrents de Switch desde su fuente. Cada entrada que casa con un
 * juego local se enlaza a él; el resto son filas `Game` de origen torrent. Si la descarga o el
 * parseo fallan, no se toca nada.
 */
export async function syncSwitchGames() {
  const platform = await db.platform.findUnique({ where: { slug: 'switch' }, select: { id: true } })
  if (!platform) throw new Error('no existe la plataforma switch')

  const res = await fetch(SOURCE_URL, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${SOURCE_URL}`)
  const raw: unknown = await res.json()
  if (!Array.isArray(raw)) throw new Error('la fuente no es una lista')

  const syncedAt = new Date()
  const rows = (raw as RawEntry[]).flatMap(e => {
    const row = toExternalRow(e, platform.id, syncedAt)
    return row ? [row] : []
  })
  if (rows.length === 0) throw new Error('la fuente no trae ningún juego')

  const locals = await db.game.findMany({
    where: { platformId: platform.id, source: 'local' },
    select: { id: true, title: true, fileName: true, titleId: true },
  })
  const localById = new Map<string, number>()
  const localByKey = new Map<string, number>()
  for (const g of locals) {
    const id = extractSwitchTitleId(g.fileName) ?? g.titleId?.toUpperCase()
    if (id && !localById.has(id)) localById.set(id, g.id)
    const key = titleKey(g.title)
    if (key.length >= 4 && !localByKey.has(key)) localByKey.set(key, g.id)
  }
  const linked = rows.map(r => {
    const byId = r.titleId ? localById.get(r.titleId) : undefined
    return { row: r, gameId: byId ?? localByKey.get(r.titleKey) ?? null }
  })

  const replaceSource = []
  replaceSource.push(db.externalGame.deleteMany({ where: { source: SWITCH_GAMES_SOURCE, platformId: platform.id } }))
  for (let i = 0; i < linked.length; i += CHUNK) {
    replaceSource.push(db.externalGame.createMany({
      data: linked.slice(i, i + CHUNK).map(({ row, gameId }) => ({ ...row, gameId })),
    }))
  }
  await db.$transaction(replaceSource)

  const torrentRows = linked.filter(l => l.gameId === null).map(l => l.row)
  const existing = await db.game.findMany({
    where: { platformId: platform.id, source: 'torrent' },
    select: { id: true, externalKey: true, manualFields: true, userHidden: true },
  })
  const existingByKey = new Map(existing.map(g => [g.externalKey, g]))

  const creates: Prisma.GameCreateManyInput[] = []
  const updates: { id: number; data: Prisma.GameUpdateInput }[] = []
  for (const row of torrentRows) {
    const externalKey = `${SWITCH_GAMES_SOURCE}:${row.sourceKey}`
    const data = torrentGameData(row, syncedAt)
    const found = existingByKey.get(externalKey)
    if (!found) {
      creates.push({
        ...data,
        source: 'torrent',
        externalKey,
        filePath: `torrent://${SWITCH_GAMES_SOURCE}/${row.sourceKey}`,
        platformId: platform.id,
      })
      continue
    }
    const locked = new Set(parseLocks(found.manualFields))
    const update: Prisma.GameUpdateInput = Object.fromEntries(
      Object.entries(data).filter(([field]) => !locked.has(field)),
    )
    if (!found.userHidden) update.isHidden = false
    updates.push({ id: found.id, data: update })
  }

  const writes = []
  for (let i = 0; i < creates.length; i += CHUNK) {
    writes.push(db.game.createMany({ data: creates.slice(i, i + CHUNK) }))
  }
  for (const u of updates) writes.push(db.game.update({ where: { id: u.id }, data: u.data }))
  await db.$transaction(writes)

  const hidden = await db.game.updateMany({
    where: { platformId: platform.id, source: 'torrent', lastSeenAt: { lt: syncedAt } },
    data: { isHidden: true },
  })

  return {
    count: rows.length,
    linked: linked.length - torrentRows.length,
    created: creates.length,
    updated: updates.length,
    hidden: hidden.count,
    skipped: raw.length - rows.length,
  }
}
