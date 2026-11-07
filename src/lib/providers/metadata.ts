import { db } from '@/lib/db'
import type { MetadataResult } from '@/lib/metadata/provider'
import { getLaunchBoxProvider, fetchLaunchBoxGame, getLaunchBoxPlatformName } from '@/lib/metadata/launchbox'
import { getRawgProvider } from '@/lib/metadata/rawg'
import { searchSteamList, fetchSteamApp } from '@/lib/metadata/steam'
import { searchNintendo, fetchNintendoById, fetchNintendoPage, nintendoConsoleOf, nintendoMetadata } from '@/lib/metadata/nintendo'
import { METADATA_SOURCES, SOURCE_LABEL, type MetadataSourceId } from './catalog'

// Adaptadores de las fuentes de metadatos (ficha, descripción, capturas). La búsqueda manual de
// «Buscar metadatos» lista las fuentes desde aquí. Añadir una fuente: una entrada en catalog.ts y
// una en ADAPTERS; TypeScript obliga a lo segundo.

/** Un resultado de búsqueda de una fuente de metadatos. */
export interface MetaCandidate { id: string; title: string; platform?: string; thumb?: string }

export interface MetaContext { platformSlug: string; title: string }

export interface MetadataAdapter {
  available(platformSlug: string): Promise<boolean>
  search(query: string, ctx: MetaContext): Promise<MetaCandidate[]>
  /** La ficha completa de un resultado, con sus capturas cuando la fuente las tiene. */
  fetch(id: string, ctx: MetaContext): Promise<MetadataResult | null>
}

async function rawgKey(): Promise<string | undefined> {
  try {
    const row = await db.setting.findUnique({ where: { key: 'rawg_api_key' } })
    return row?.value || process.env.RAWG_API_KEY || undefined
  } catch { return process.env.RAWG_API_KEY || undefined }
}

const launchbox: MetadataAdapter = {
  available: async (slug) => Boolean(await getLaunchBoxPlatformName(slug)),
  async search(query, ctx) {
    if (!query.trim()) return []
    const results = await (await getLaunchBoxProvider(ctx.platformSlug)).search(query, ctx.platformSlug, query)
    return results.map(r => ({ id: String(r.id), title: r.title, platform: r.platformName, thumb: r.coverUrl }))
  },
  async fetch(id) {
    return fetchLaunchBoxGame(Number(id))
  },
}

const rawg: MetadataAdapter = {
  available: async () => Boolean(await rawgKey()),
  async search(query, ctx) {
    if (!query.trim()) return []
    const provider = getRawgProvider(await rawgKey())
    if (!provider) return []
    const results = await provider.search(query, ctx.platformSlug, query)
    return results.map(r => ({ id: String(r.id), title: r.title, platform: r.platformName, thumb: r.coverUrl }))
  },
  async fetch(id) {
    const provider = getRawgProvider(await rawgKey())
    if (!provider) return null
    const meta = await provider.fetchById(id)
    if (!meta) return null
    if (meta.slug) {
      try { meta.screenshots = await provider.fetchScreenshots(meta.slug) } catch { /* sin capturas */ }
    }
    return meta
  },
}

const steam: MetadataAdapter = {
  available: async () => true,
  async search(query) {
    // Steam: la búsqueda manual es libre; el dueño elige la aplicación.
    if (!query.trim()) return []
    return (await searchSteamList(query)).map(x => ({ id: String(x.id), title: x.name }))
  },
  async fetch(id, ctx) {
    return fetchSteamApp(Number(id), ctx.title)
  },
}

const nintendo: MetadataAdapter = {
  available: async (slug) => nintendoConsoleOf(slug) !== null,
  async search(query, ctx) {
    const consoleId = nintendoConsoleOf(ctx.platformSlug)
    if (!consoleId || !query.trim()) return []
    const hits = await searchNintendo(query, consoleId, 8)
    return hits.map(h => ({ id: String(h.id), title: h.title, platform: consoleId, thumb: h.images.square ?? h.images.packshot }))
  },
  async fetch(id, ctx) {
    const consoleId = nintendoConsoleOf(ctx.platformSlug)
    if (!consoleId) return null
    const hit = await fetchNintendoById(Number(id), consoleId)
    if (!hit) return null
    const page = await fetchNintendoPage(hit.url)
    return nintendoMetadata(hit, page.gallery, page.description)
  },
}

/** Un adaptador por fuente: TypeScript exige una entrada por cada id de METADATA_SOURCES. */
export const METADATA_ADAPTERS: Record<MetadataSourceId, MetadataAdapter> = { launchbox, rawg, steam, nintendo }

export function isMetadataSource(v: unknown): v is MetadataSourceId {
  return typeof v === 'string' && (METADATA_SOURCES as readonly string[]).includes(v)
}

/** Todas las fuentes de metadatos, con si pueden responder ahora para esta plataforma. */
export async function metadataSourcesFor(platformSlug: string): Promise<Array<{ id: MetadataSourceId; label: string; available: boolean }>> {
  return Promise.all(METADATA_SOURCES.map(async id => ({
    id,
    label: SOURCE_LABEL[id],
    available: await METADATA_ADAPTERS[id].available(platformSlug).catch(() => false),
  })))
}
