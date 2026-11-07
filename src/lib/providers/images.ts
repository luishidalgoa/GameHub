import { db } from '@/lib/db'
import { getLaunchBoxProvider, fetchLaunchBoxGame, getLaunchBoxPlatformName, type LaunchBoxImage } from '@/lib/metadata/launchbox'
import { getRawgProvider } from '@/lib/metadata/rawg'
import { searchSteamList, steamBackgrounds } from '@/lib/metadata/steam'
import { searchLibretroCovers, libretroSupports } from '@/lib/metadata/libretro'
import { searchNintendo, fetchNintendoPage, nintendoConsoleOf } from '@/lib/metadata/nintendo'
import { IMAGE_SOURCES, IMAGE_SOURCE_SLOTS, SOURCE_LABEL, type ImageSlot, type ImageSourceId } from './catalog'

// Adaptadores de las fuentes de imágenes. Cada fuente implementa el mismo contrato; el buscador
// de cada hueco (portada, banner, logo, fondo, capturas) las lista desde aquí. Añadir una fuente:
// una entrada en catalog.ts (con sus huecos) y una entrada en ADAPTERS. TypeScript obliga a lo segundo.

/** Una imagen que el buscador ofrece: la original y su miniatura. */
export interface ImageItem { url: string; thumb: string }

/** Un resultado de búsqueda: un juego de la fuente. `images` viene ya listo cuando la fuente lo da barato. */
export interface ImageMatch { id: string; name: string; thumb?: string; images?: ImageItem[] }

export interface ImageContext { platformSlug: string; title: string; fileName?: string | null }

export interface ImageAdapter {
  /** Puede responder para esta plataforma (clave configurada, consola soportada…). */
  available(platformSlug: string): Promise<boolean>
  /** Juegos que coinciden con el texto, para el hueco pedido. */
  search(query: string, slot: ImageSlot, ctx: ImageContext): Promise<ImageMatch[]>
  /** Las imágenes de un resultado para el hueco pedido, cuando no venían en la búsqueda. */
  images(id: string, slot: ImageSlot, ctx: ImageContext): Promise<ImageItem[]>
}

// ── Claves ───────────────────────────────────────────────────────────────────

async function setting(key: string): Promise<string | undefined> {
  try {
    const row = await db.setting.findUnique({ where: { key } })
    return row?.value || undefined
  } catch { return undefined }
}

async function rawgKey(): Promise<string | undefined> {
  return (await setting('rawg_api_key')) || process.env.RAWG_API_KEY || undefined
}

async function steamGridKey(): Promise<string | undefined> {
  return (await setting('steamgriddb_key')) || process.env.STEAMGRIDDB_API_KEY || process.env.STEAMGRIDDB_KEY || undefined
}

// ── LaunchBox: la clasificación de sus imágenes por hueco ───────────────────

// Mejor tipo de portada primero. «Fanart - Box - Front» contiene «box - front»: se mira antes su
// condición de fanart, para que el arte de usuario nunca gane a la caja oficial.
function coverRank(type: string): number {
  const isFanart = /fanart/i.test(type)
  if (!isFanart && /^box\s*-\s*front$/i.test(type)) return 0
  if (!isFanart && /box\s*-\s*front/i.test(type))   return 1
  if (!isFanart && /box\s*-\s*3d/i.test(type))       return 2
  if (/clear\s*logo/i.test(type))                    return 3
  if (/box\s*-\s*front/i.test(type))                 return 4
  if (/fanart/i.test(type))                          return 5
  if (/banner/i.test(type))                          return 6
  return 7
}
const COVER_RANK_MAX = 7

/** Las imágenes de LaunchBox que sirven a un hueco, la mejor primero. */
export function launchBoxImagesFor(images: LaunchBoxImage[], slot: ImageSlot): ImageItem[] {
  const pick = (img: LaunchBoxImage): boolean => {
    switch (slot) {
      case 'cover':      return coverRank(img.type) < COVER_RANK_MAX
      case 'banner':     return /^banner$/i.test(img.type)
      case 'logo':       return /clear\s*logo/i.test(img.type)
      case 'fanart':     return /fanart/i.test(img.type) && !/box/i.test(img.type)
      case 'screenshot': return /screenshot/i.test(img.type)
    }
  }
  return images
    .filter(pick)
    .sort((a, b) => (slot === 'cover' ? coverRank(a.type) - coverRank(b.type) : 0))
    .map(img => ({ url: img.url, thumb: img.thumbUrl ?? img.url }))
}

// ── SteamGridDB ──────────────────────────────────────────────────────────────

const SGDB = 'https://www.steamgriddb.com/api/v2'

async function sgdbFetch(path: string, key: string): Promise<unknown> {
  const res = await fetch(`${SGDB}${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.errors?.[0] ?? `SteamGridDB HTTP ${res.status}`)
  return data
}

/** El tipo de imagen de SteamGridDB que sirve a cada hueco. Ninguno para las capturas. */
const SGDB_TYPE: Partial<Record<ImageSlot, 'grids' | 'heroes' | 'logos'>> = {
  cover: 'grids', banner: 'heroes', fanart: 'heroes', logo: 'logos',
}

// ── Adaptadores ──────────────────────────────────────────────────────────────

const libretro: ImageAdapter = {
  available: async (slug) => libretroSupports(slug),
  async search(query, slot, ctx) {
    if (slot !== 'cover' || !query.trim()) return []
    // Se busca el texto y el nombre del fichero: el texto encuentra un juego renombrado, el fichero
    // la edición regional exacta. Lo mismo por las dos vías conserva su mejor puntuación.
    const byQuery = await searchLibretroCovers(query, ctx.platformSlug)
    const byFile = ctx.fileName ? await searchLibretroCovers(ctx.fileName, ctx.platformSlug) : []
    const merged = new Map<string, { name: string; url: string; score: number }>()
    for (const c of [...byFile, ...byQuery]) {
      const prev = merged.get(c.url)
      if (!prev || c.score > prev.score) merged.set(c.url, c)
    }
    return [...merged.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(c => ({ id: c.url, name: c.name, thumb: c.url, images: [{ url: c.url, thumb: c.url }] }))
  },
  async images(id, slot) { return slot === 'cover' ? [{ url: id, thumb: id }] : [] },
}

const launchbox: ImageAdapter = {
  available: async (slug) => Boolean(await getLaunchBoxPlatformName(slug)),
  async search(query, _slot, ctx) {
    if (!query.trim()) return []
    const results = await (await getLaunchBoxProvider(ctx.platformSlug)).search(query, ctx.platformSlug, query)
    return results.slice(0, 8).map(r => ({ id: String(r.id), name: r.title, thumb: r.coverUrl }))
  },
  async images(id, slot) {
    const game = await fetchLaunchBoxGame(Number(id))
    return game ? launchBoxImagesFor(game.images ?? [], slot) : []
  },
}

const steamgriddb: ImageAdapter = {
  available: async () => Boolean(await steamGridKey()),
  async search(query, slot) {
    if (!SGDB_TYPE[slot] || !query.trim()) return []
    const key = await steamGridKey()
    if (!key) return []
    const data = await sgdbFetch(`/search/autocomplete/${encodeURIComponent(query)}`, key) as { data?: Array<{ id: number; name: string }> }
    return (data.data ?? []).slice(0, 8).map(g => ({ id: String(g.id), name: g.name }))
  },
  async images(id, slot) {
    const type = SGDB_TYPE[slot]
    const key = await steamGridKey()
    if (!type || !key) return []
    // Portadas en formato caja (600×900 o 342×482); banners y fondos son «heroes», logos son «logos».
    const path = type === 'grids'
      ? `/grids/game/${id}?dimensions=600x900,342x482&nsfw=false`
      : `/${type}/game/${id}?nsfw=false`
    const data = await sgdbFetch(path, key) as { data?: Array<{ url: string; thumb?: string }> }
    return (data.data ?? []).slice(0, 12).map(c => ({ url: c.url, thumb: c.thumb ?? c.url }))
  },
}

const rawg: ImageAdapter = {
  available: async () => Boolean(await rawgKey()),
  async search(query, slot, ctx) {
    if (!query.trim() || (slot !== 'cover' && slot !== 'screenshot')) return []
    const provider = getRawgProvider(await rawgKey())
    if (!provider) return []
    const results = await provider.search(query, ctx.platformSlug, query)
    return results.slice(0, 8).map(r => ({
      id: String(r.id),
      name: r.title,
      thumb: r.coverUrl,
      images: slot === 'cover' && r.coverUrl ? [{ url: r.coverUrl, thumb: r.coverUrl }] : undefined,
    }))
  },
  async images(id, slot) {
    const provider = getRawgProvider(await rawgKey())
    if (!provider) return []
    const game = await provider.fetchById(id)
    if (!game) return []
    if (slot === 'cover') return game.coverUrl ? [{ url: game.coverUrl, thumb: game.coverUrl }] : []
    if (slot === 'screenshot' && game.slug) {
      const shots = await provider.fetchScreenshots(game.slug).catch(() => [])
      return shots.map(u => ({ url: u, thumb: u }))
    }
    return []
  },
}

const steam: ImageAdapter = {
  available: async () => true,
  async search(query, slot) {
    if (slot !== 'fanart' || !query.trim()) return []
    return (await searchSteamList(query)).map(x => ({ id: String(x.id), name: x.name }))
  },
  async images(id, slot) {
    if (slot !== 'fanart') return []
    return (await steamBackgrounds(Number(id))).map(i => ({ url: i.url, thumb: i.thumb }))
  },
}

const nintendo: ImageAdapter = {
  available: async (slug) => nintendoConsoleOf(slug) !== null,
  async search(query, slot, ctx) {
    const consoleId = nintendoConsoleOf(ctx.platformSlug)
    if (!consoleId || !query.trim() || !IMAGE_SOURCE_SLOTS.nintendo.includes(slot)) return []
    const hits = await searchNintendo(query, consoleId, 8)
    return hits.map(h => {
      const { square, packshot, banner } = h.images
      const byslot: Partial<Record<ImageSlot, ImageItem[]>> = {
        // La cuadrada de la eShop es la portada del formato secundario; la caja, la de respaldo.
        cover: [square, packshot].filter((u): u is string => Boolean(u)).map(u => ({ url: u, thumb: u })),
        banner: banner ? [{ url: banner, thumb: banner }] : [],
      }
      return {
        // El id de un resultado de Nintendo es su ficha: la galería se pide con ella.
        id: h.url,
        name: h.title,
        thumb: square ?? packshot,
        images: byslot[slot],
      }
    })
  },
  async images(id, slot) {
    if (slot !== 'screenshot') return []
    const page = await fetchNintendoPage(id)
    return page.gallery.map(u => ({ url: u, thumb: u }))
  },
}

/** Un adaptador por fuente: TypeScript exige una entrada por cada id de IMAGE_SOURCES. */
export const IMAGE_ADAPTERS: Record<ImageSourceId, ImageAdapter> = { launchbox, steamgriddb, libretro, rawg, steam, nintendo }

/** Las fuentes que cubren un hueco, con si pueden responder ahora para esta plataforma. */
export async function imageSourcesFor(slot: ImageSlot, platformSlug: string): Promise<Array<{ id: ImageSourceId; label: string; available: boolean }>> {
  const covering = IMAGE_SOURCES.filter(id => IMAGE_SOURCE_SLOTS[id].includes(slot))
  return Promise.all(covering.map(async id => ({
    id,
    label: SOURCE_LABEL[id],
    available: await IMAGE_ADAPTERS[id].available(platformSlug).catch(() => false),
  })))
}
