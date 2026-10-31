import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { fileToTitle, toSortTitle } from '@/lib/utils'
import { parseLocks } from '@/lib/manual-fields'
import { extractSwitchTitleId } from '@/lib/scanner/titleid'
import { titleKey } from './match'
import { planVariantFold } from './variants'
import { cleanSwitchTitle } from './title-clean'
import { createProvider, type RawEntry } from './sources'
import { parseSourceConfigs, type SourceConfig } from './source-types'

const CHUNK = 500

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
const GB_CONSOLES = ['gb', 'gbc', 'gba'] as const
const GB_EXTENSIONS: Record<string, string> = { '.gb': 'gb', '.gbc': 'gbc', '.gba': 'gba' }

/** Consola de Game Boy de una fuente («minerva-gbc» → «gbc»), o null si la fuente no es de una. */
function consoleOfSource(source: string): string | null {
  const c = source.replace(/^minerva-/, '')
  return (GB_CONSOLES as readonly string[]).includes(c) ? c : null
}

/** Consola de Game Boy de un fichero local por su extensión, o null. */
function consoleOfFile(fileName: string): string | null {
  return GB_EXTENSIONS[fileName.slice(fileName.lastIndexOf('.')).toLowerCase()] ?? null
}

/**
 * Identidad de un juego sin Title ID. En Game Boy el mismo título existe en GB, GBC y GBA y no es el
 * mismo juego: GB y GBC llevan su consola en la identidad; GBA conserva la de siempre.
 * Un nombre corto (p. ej. «16t») cuenta igual que uno largo: sus variantes de un mismo archivo
 * torrent son una sola fila por plataforma. Solo un nombre vacío cae en la identidad del topic.
 */
export function identityOf(e: { titleId: string | null; titleKey: string; source: string; sourceKey: string }): string {
  if (e.titleId) return `id:${e.titleId}`
  if (e.titleKey.length > 0) {
    const console = consoleOfSource(e.source)
    return `key:${console && console !== 'gba' ? `${console}:` : ''}${e.titleKey}`
  }
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

const torrentPath = (platformSlug: string, identity: string) => `torrent://${platformSlug}/${identity}`

function torrentFields(platformSlug: string, title: string, size: string | null, titleId: string | null) {
  const clean = platformSlug === 'switch'
    ? cleanSwitchTitle(title)
    : fileToTitle(title).replace(DLC_TAIL, '').trim() || title.trim()
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
async function reconcileTorrentGames(platformId: number, syncedAt: Date, order: string[]) {
  const ext = await db.externalGame.findMany({
    where: { platformId, source: { in: order } },
    select: { id: true, source: true, sourceKey: true, title: true, titleId: true, titleKey: true, size: true, gameId: true },
  }) as ExtRow[]
  const platformSlug = (await db.platform.findUnique({ where: { id: platformId }, select: { slug: true } }))?.slug ?? String(platformId)
  const rank = (source: string) => {
    const i = order.indexOf(source)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }

  const identityByTopic = new Map<string, string>()
  // Las filas y la lista negra guardadas antes con la identidad por topic (`topic:<fuente>:<id>`)
  // pasan a la identidad actual de su entrada: así no se liberan y se vuelven a crear.
  const identityByLegacy = new Map<string, string>()
  const byIdentity = new Map<string, ExtRow[]>()
  const localIdentities = new Set<string>()
  for (const e of ext) {
    const identity = identityOf(e)
    identityByTopic.set(`${e.source}|${e.sourceKey}`, identity)
    identityByLegacy.set(`topic:${e.source}:${e.sourceKey}`, identity)
    if (e.gameId !== null) {
      localIdentities.add(identity)
      continue
    }
    byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), e])
  }
  for (const id of localIdentities) byIdentity.delete(id)
  // Lo que el usuario quitó no vuelve a crearse, aunque el catálogo siga trayéndolo:
  // así una purga de la papelera no hace reaparecer los juegos ocultos.
  const blacklisted = await db.torrentBlacklist.findMany({ where: { platformId }, select: { identity: true, source: true } })
  for (const { identity } of blacklisted) byIdentity.delete(identityByLegacy.get(identity) ?? identity)
  // Las claves de la lista negra se conservan en las filas ocultas: el cementerio las usa para no mostrarlas.
  const blockedKeys = new Set(blacklisted.flatMap(b => (b.source ? [`torrent:${b.source}:${b.identity}`] : [])))
  for (const list of byIdentity.values()) {
    list.sort((a, b) => rank(a.source) - rank(b.source))
  }

  // Los juegos divididos de un lote (splitFromId) no son filas de la fuente: no se reconcilian.
  const games = await db.game.findMany({
    where: { platformId, source: 'torrent', splitFromId: null },
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
    const identity = 'identity' in parsed
      ? (identityByLegacy.get(parsed.identity) ?? parsed.identity)
      : identityByTopic.get(`${parsed.source}|${parsed.topic}`)
    if (!identity || !byIdentity.has(identity) || ownerByIdentity.has(identity)) continue
    ownerByIdentity.set(identity, g)
    ownerSource.set(g.id, parsed.source)
    claimed.add(g.id)
  }
  // Un juego que vuelve reutiliza su fila oculta. La ruta es única por plataforma e identidad;
  // las filas anteriores (`torrent://<identidad>`) se siguen reconociendo dentro de la plataforma.
  const byFilePath = new Map(games.map(g => [g.filePath, g]))
  for (const identity of byIdentity.keys()) {
    if (ownerByIdentity.has(identity)) continue
    const g = byFilePath.get(torrentPath(platformSlug, identity)) ?? byFilePath.get(`torrent://${identity}`)
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
    const fields = torrentFields(platformSlug, pick.title, pick.size, pick.titleId)

    if (!current) {
      creates.push({
        ...fields, source: 'torrent', externalKey, platformId, lastSeenAt: syncedAt,
        filePath: torrentPath(platformSlug, identity),
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
  const released = games.filter(g =>
    !kept.has(g.id) && (g.externalKey !== null || !g.isHidden) && !(g.externalKey !== null && blockedKeys.has(g.externalKey)),
  )
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
  await foldVariants(platformId)

  return { created: creates.length, updated, hidden: released.filter(g => !g.isHidden).length, unchanged: kept.size - updated }
}

/**
 * Asigna variantOfId a las filas torrent de la plataforma según planVariantFold. Las bases pueden ser
 * también juegos locales visibles, por su título limpio (sin etiquetas del fichero). Las filas no se
 * borran: quedan ocultas en la biblioteca y vuelven a verse si su base desaparece.
 */
async function foldVariants(platformId: number) {
  const games = await db.game.findMany({
    where: {
      platformId, splitFromId: null,
      OR: [{ source: 'torrent' }, { source: 'local', isHidden: false }],
    },
    select: { id: true, fileName: true, source: true, variantOfId: true },
  })
  const plan = planVariantFold(games.map(g => ({
    id: g.id,
    rawTitle: g.source === 'local' ? fileToTitle(g.fileName) : g.fileName,
  })))
  const rows = games.filter(g => g.source === 'torrent')
  const torrentIds = new Set(rows.map(r => r.id))
  const idsByBase = new Map<number, number[]>()
  for (const [id, base] of plan) {
    if (!torrentIds.has(id)) continue
    idsByBase.set(base, [...(idsByBase.get(base) ?? []), id])
  }
  const writes: Prisma.PrismaPromise<unknown>[] = []
  for (const [base, ids] of idsByBase) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      writes.push(db.game.updateMany({ where: { id: { in: ids.slice(i, i + CHUNK) } }, data: { variantOfId: base } }))
    }
  }
  const unfolded = rows.filter(r => r.variantOfId !== null && !plan.has(r.id)).map(r => r.id)
  for (let i = 0; i < unfolded.length; i += CHUNK) {
    writes.push(db.game.updateMany({ where: { id: { in: unfolded.slice(i, i + CHUNK) } }, data: { variantOfId: null } }))
  }
  for (let i = 0; i < writes.length; i += CHUNK) await db.$transaction(writes.slice(i, i + CHUNK))
}

export interface SourceResult {
  count: number
  linked: number
  sourceRows: { created: number; updated: number; removed: number }
  skipped: number
}

/** Enlaza cada entrada con un juego local que sea el mismo, por Title ID o por nombre. */
async function linkToLocal(platformId: number, platformSlug: string, rows: ExternalGameRow[]) {
  const locals = await db.game.findMany({
    where: { platformId, source: 'local' },
    select: { id: true, title: true, fileName: true, titleId: true },
  })
  const localById = new Map<string, number>()
  const localByKey = new Map<string, number>()
  for (const g of locals) {
    const id = (platformSlug === 'switch' ? extractSwitchTitleId(g.fileName) : null) ?? g.titleId?.toUpperCase()
    if (id && !localById.has(id)) localById.set(id, g.id)
    const key = titleKey(g.title)
    const bucket = `${consoleOfFile(g.fileName) ?? ''}|${key}`
    if (key.length >= 4 && !localByKey.has(bucket)) localByKey.set(bucket, g.id)
  }
  return rows.map(r => {
    const byId = r.titleId ? localById.get(r.titleId) : undefined
    const bucket = `${consoleOfSource(r.source) ?? ''}|${r.titleKey}`
    return { ...r, gameId: byId ?? localByKey.get(bucket) ?? null }
  })
}

/** Una fuente: la descarga, la convierte y escribe sus filas. Si falla, no toca nada de esa fuente. */
async function syncOneSource(source: SourceConfig, platformId: number, platformSlug: string): Promise<SourceResult> {
  const entries = await createProvider(source).fetchEntries()

  const syncedAt = new Date()
  const rows = entries.flatMap(e => {
    const row = toExternalRow(e, platformId, source.key)
    return row ? [row] : []
  })
  if (rows.length === 0) throw new Error('la fuente no trae ningún juego')

  const linked = await linkToLocal(platformId, platformSlug, rows)
  const sourceRows = await writeSourceRows(platformId, source.key, linked, syncedAt)
  return {
    count: rows.length,
    linked: linked.filter(r => r.gameId !== null).length,
    sourceRows,
    skipped: entries.length - rows.length,
  }
}

/** Tras cambiar las fuentes de una plataforma: borra las filas de las quitadas y recalcula sus juegos. */
export async function refreshTorrentGames(platformId: number, removed: string[], active: string[]) {
  if (removed.length) await db.externalGame.deleteMany({ where: { platformId, source: { in: removed } } })
  return reconcileTorrentGames(platformId, new Date(), active)
}

/** Las fuentes configuradas de una plataforma, activas o no, en orden de prioridad. */
export async function platformTorrentSources(platformSlug: string): Promise<SourceConfig[]> {
  const platform = await db.platform.findUnique({ where: { slug: platformSlug }, select: { torrentSources: true } })
  return parseSourceConfigs(platform?.torrentSources)
}

/**
 * Sincroniza las fuentes activas de cada plataforma, o solo de una, y reconcilia sus juegos.
 * Una fuente que falla conserva sus filas anteriores y las demás siguen. Una fuente desactivada
 * deja de contar: sus juegos que no tengan otra fuente se ocultan.
 */
export async function syncTorrentSources(platformSlug?: string) {
  const platforms = await db.platform.findMany({
    where: { torrentSources: { not: null }, ...(platformSlug ? { slug: platformSlug } : {}) },
    select: { id: true, slug: true, torrentSources: true },
  })
  const results: Record<string, SourceResult | { error: string }> = {}
  const games: Record<string, Awaited<ReturnType<typeof reconcileTorrentGames>>> = {}

  for (const platform of platforms) {
    const active = parseSourceConfigs(platform.torrentSources).filter(s => s.enabled)
    for (const source of active) {
      try {
        results[source.key] = await syncOneSource(source, platform.id, platform.slug)
      } catch (err) {
        results[source.key] = { error: err instanceof Error ? err.message : String(err) }
      }
    }
    games[platform.slug] = await reconcileTorrentGames(platform.id, new Date(), active.map(s => s.key))
  }
  return { sources: results, games }
}
