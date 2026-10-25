import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { fileToTitle, toSortTitle } from '@/lib/utils'
import { parseLocks } from '@/lib/manual-fields'
import { extractSwitchTitleId } from '@/lib/scanner/titleid'
import { titleKey } from './match'

export const SWITCH_GAMES_SOURCE = 'switch-games'
// Fuentes de torrents por orden de preferencia para un mismo juego.
const TORRENT_SOURCES = [SWITCH_GAMES_SOURCE]
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
}

const TITLE_ID = /^[0-9a-f]{16}$/i

const text = (v: string | undefined): string | null => v?.trim() || null

export function toExternalRow(e: RawEntry, platformId: number, source: string): ExternalGameRow | null {
  if (!e.title || !e.magnet || !e.topic_id || !e.url) return null
  const titleId = e.title_id?.trim()
  const year = Number.parseInt(e.year ?? '', 10)
  return {
    source,
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

/** Identidad de un juego entre fuentes: su Title ID, o su nombre cuando no lo tiene. */
function identityOf(e: { titleId: string | null; titleKey: string; source: string; sourceKey: string }): string {
  if (e.titleId) return `id:${e.titleId}`
  if (e.titleKey.length >= 4) return `key:${e.titleKey}`
  return `topic:${e.source}:${e.sourceKey}`
}

/** Clave de una fila torrent: `torrent:<fuente>:<identidad>`. Las antiguas `<fuente>:<topic>` se leen por su topic. */
function parseTorrentKey(externalKey: string): { source: string; identity: string } | { source: string; topic: string } | null {
  if (externalKey.startsWith('torrent:')) {
    const rest = externalKey.slice('torrent:'.length)
    const cut = rest.indexOf(':')
    return cut > 0 ? { source: rest.slice(0, cut), identity: rest.slice(cut + 1) } : null
  }
  const cut = externalKey.indexOf(':')
  return cut > 0 ? { source: externalKey.slice(0, cut), topic: externalKey.slice(cut + 1) } : null
}

function torrentFields(title: string, size: string | null, titleId: string | null) {
  const clean = fileToTitle(title).replace(DLC_TAIL, '').trim() || title.trim()
  return {
    title: clean,
    sortTitle: toSortTitle(clean),
    fileName: title,
    fileSize: sizeBytes(size),
    titleId,
  }
}

interface ExtRow {
  id: number
  source: string
  sourceKey: string
  title: string
  titleId: string | null
  titleKey: string
  size: string | null
  gameId: number | null
}

/**
 * Escribe una fuente en la tabla de filas externas: solo las nuevas, las que cambian y las que
 * desaparecen. Lo demás no se toca.
 */
async function writeSourceRows(platformId: number, source: string, rows: (ExternalGameRow & { gameId: number | null })[], syncedAt: Date) {
  const existing = await db.externalGame.findMany({ where: { platformId, source } })
  const byKey = new Map(existing.map(e => [e.sourceKey, e]))
  const incoming = new Set(rows.map(r => r.sourceKey))

  const creates = rows.filter(r => !byKey.has(r.sourceKey))
  const updates = rows.flatMap(r => {
    const e = byKey.get(r.sourceKey)
    if (!e) return []
    const same = e.title === r.title && e.titleId === r.titleId && e.titleKey === r.titleKey
      && e.magnet === r.magnet && e.sourceUrl === r.sourceUrl && e.size === r.size && e.format === r.format
      && e.hasDlc === r.hasDlc && e.cover === r.cover && e.year === r.year && e.genre === r.genre
      && e.developer === r.developer && e.publisher === r.publisher && e.description === r.description
      && e.gameId === r.gameId
    return same ? [] : [{ id: e.id, data: { ...r, syncedAt } }]
  })
  const removed = existing.filter(e => !incoming.has(e.sourceKey)).map(e => e.id)

  const writes: Prisma.PrismaPromise<unknown>[] = []
  for (let i = 0; i < removed.length; i += CHUNK) {
    writes.push(db.externalGame.deleteMany({ where: { id: { in: removed.slice(i, i + CHUNK) } } }))
  }
  for (let i = 0; i < creates.length; i += CHUNK) {
    writes.push(db.externalGame.createMany({ data: creates.slice(i, i + CHUNK).map(r => ({ ...r, syncedAt })) }))
  }
  for (const u of updates) writes.push(db.externalGame.update({ where: { id: u.id }, data: u.data }))
  for (let i = 0; i < writes.length; i += CHUNK) await db.$transaction(writes.slice(i, i + CHUNK))
  return { created: creates.length, updated: updates.length, removed: removed.length }
}

/**
 * Un juego de biblioteca por identidad: si varias fuentes lo tienen, se queda la que ya lo
 * tenía mientras siga en su fuente; si no, la primera por preferencia. Los juegos que casan con
 * uno local no tienen fila torrent.
 */
async function reconcileTorrentGames(platformId: number, syncedAt: Date) {
  const ext = await db.externalGame.findMany({
    where: { platformId, source: { in: TORRENT_SOURCES } },
    select: { id: true, source: true, sourceKey: true, title: true, titleId: true, titleKey: true, size: true, gameId: true },
  }) as ExtRow[]

  const identityByTopic = new Map<string, string>()
  const byIdentity = new Map<string, ExtRow[]>()
  const localIdentities = new Set<string>()
  for (const e of ext) {
    const identity = identityOf(e)
    identityByTopic.set(`${e.source}|${e.sourceKey}`, identity)
    if (e.gameId !== null) {
      localIdentities.add(identity)
      continue
    }
    byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), e])
  }
  for (const id of localIdentities) byIdentity.delete(id)
  for (const list of byIdentity.values()) {
    list.sort((a, b) => TORRENT_SOURCES.indexOf(a.source) - TORRENT_SOURCES.indexOf(b.source))
  }

  const games = await db.game.findMany({
    where: { platformId, source: 'torrent' },
    select: {
      id: true, externalKey: true, filePath: true, title: true, fileName: true, fileSize: true, titleId: true,
      manualFields: true, userHidden: true, isHidden: true,
    },
  })
  const ownerByIdentity = new Map<string, (typeof games)[number]>()
  const ownerSource = new Map<number, string>()
  const claimed = new Set<number>()
  for (const g of games) {
    const parsed = g.externalKey ? parseTorrentKey(g.externalKey) : null
    if (!parsed) continue
    const identity = 'identity' in parsed ? parsed.identity : identityByTopic.get(`${parsed.source}|${parsed.topic}`)
    if (!identity || !byIdentity.has(identity) || ownerByIdentity.has(identity)) continue
    ownerByIdentity.set(identity, g)
    ownerSource.set(g.id, parsed.source)
    claimed.add(g.id)
  }
  // Un juego que vuelve reutiliza su fila oculta: la ruta es única por identidad.
  const byFilePath = new Map(games.map(g => [g.filePath, g]))
  for (const identity of byIdentity.keys()) {
    if (ownerByIdentity.has(identity)) continue
    const g = byFilePath.get(`torrent://${identity}`)
    if (g && !claimed.has(g.id)) {
      ownerByIdentity.set(identity, g)
      claimed.add(g.id)
    }
  }

  const kept = new Set<number>()
  const creates: Prisma.GameCreateManyInput[] = []
  const updates: Prisma.PrismaPromise<unknown>[] = []
  let updated = 0
  for (const [identity, entries] of byIdentity) {
    const current = ownerByIdentity.get(identity)
    const keep = current ? ownerSource.get(current.id) : undefined
    const pick = entries.find(e => e.source === keep) ?? entries[0]
    const externalKey = `torrent:${pick.source}:${identity}`
    const fields = torrentFields(pick.title, pick.size, pick.titleId)

    if (!current) {
      creates.push({
        ...fields, source: 'torrent', externalKey, platformId, lastSeenAt: syncedAt,
        filePath: `torrent://${identity}`,
      })
      continue
    }
    kept.add(current.id)
    const locked = new Set(parseLocks(current.manualFields))
    // El título lo pone el proveedor de metadatos: solo se toma de la fuente si esta lo cambia.
    const { title: _title, sortTitle: _sortTitle, ...sameTitle } = fields
    const next = current.fileName === pick.title ? sameTitle : fields
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries({ ...next, externalKey }).filter(([field]) => !locked.has(field)),
    )
    if (!current.userHidden) patch.isHidden = false
    const changed = current.externalKey !== externalKey
      || current.title !== (patch.title ?? current.title)
      || current.fileName !== (patch.fileName ?? current.fileName)
      || current.fileSize !== (patch.fileSize ?? current.fileSize)
      || current.titleId !== (patch.titleId ?? current.titleId)
      || current.isHidden !== (patch.isHidden ?? current.isHidden)
    if (changed) {
      updates.push(db.game.update({ where: { id: current.id }, data: patch as Prisma.GameUpdateInput }))
      updated++
    }
  }

  // Antes de asignar claves se sueltan las de las filas que ya no son el juego de ninguna fuente:
  // la clave es única y un duplicado oculto podría tenerla.
  const released = games.filter(g => !kept.has(g.id) && (g.externalKey !== null || !g.isHidden))
  const writes: Prisma.PrismaPromise<unknown>[] = []
  for (let i = 0; i < released.length; i += CHUNK) {
    writes.push(db.game.updateMany({
      where: { id: { in: released.slice(i, i + CHUNK).map(g => g.id) } },
      data: { externalKey: null, isHidden: true },
    }))
  }
  for (let i = 0; i < creates.length; i += CHUNK) {
    writes.push(db.game.createMany({ data: creates.slice(i, i + CHUNK) }))
  }
  writes.push(...updates)
  for (let i = 0; i < writes.length; i += CHUNK) await db.$transaction(writes.slice(i, i + CHUNK))

  return { created: creates.length, updated, hidden: released.filter(g => !g.isHidden).length, unchanged: kept.size - updated }
}

/**
 * Pone al día la lista de torrents de Switch. Escribe solo lo que cambia y no toca nada si la
 * descarga o el parseo fallan.
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
    const row = toExternalRow(e, platform.id, SWITCH_GAMES_SOURCE)
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
    return { ...r, gameId: byId ?? localByKey.get(r.titleKey) ?? null }
  })

  const sourceRows = await writeSourceRows(platform.id, SWITCH_GAMES_SOURCE, linked, syncedAt)
  const games = await reconcileTorrentGames(platform.id, syncedAt)

  return {
    count: rows.length,
    linked: linked.filter(r => r.gameId !== null).length,
    sourceRows,
    games,
    skipped: raw.length - rows.length,
  }
}
