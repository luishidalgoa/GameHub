import { db } from '@/lib/db'

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

/**
 * Reemplaza los torrents de Switch por la lista actual de la fuente. Si la descarga o el
 * parseo fallan, no se toca nada: las filas anteriores siguen.
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

  const inserts = []
  for (let i = 0; i < rows.length; i += CHUNK) {
    inserts.push(db.externalGame.createMany({ data: rows.slice(i, i + CHUNK) }))
  }
  await db.$transaction([
    db.externalGame.deleteMany({ where: { source: SWITCH_GAMES_SOURCE, platformId: platform.id } }),
    ...inserts,
  ])
  return { count: rows.length, skipped: raw.length - rows.length }
}
