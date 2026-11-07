import type { MetadataResult } from './provider'
import { providerFetch } from './http'

// Steam Store, sin clave: la búsqueda por título y la ficha de cada aplicación. Solo sirve
// para juegos que existen en Steam. El emparejamiento es por título exacto (sin acentos, mayúsculas
// ni signos) y solo cuenta una ficha de tipo «game», así que una edición con otro nombre o un DLC
// no se toma por el juego.

const STORE = 'https://store.steampowered.com'
const TIMEOUT_MS = 15_000
const LANG = 'english'

/** La clave con la que se comparan títulos: letras y dígitos, sin acentos ni mayúsculas. */
export function steamTitleKey(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Texto plano de una descripción de Steam, que llega como HTML con etiquetas y entidades. */
export function stripSteamHtml(html: string | undefined): string | undefined {
  if (!html) return undefined
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;|&mdash;/g, '–')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || undefined
}

/** La aplicación de la búsqueda cuyo nombre coincide con el título, o null. Solo juegos base. */
export function matchStoreSearch(json: unknown, title: string): number | null {
  const key = steamTitleKey(title)
  if (key.length < 2) return null
  const items = (json as { items?: Array<{ id?: unknown; name?: unknown; type?: unknown }> } | null)?.items ?? []
  for (const item of items) {
    if (item.type !== undefined && item.type !== 'app') continue
    if (typeof item.id !== 'number' || typeof item.name !== 'string') continue
    if (steamTitleKey(item.name) === key) return item.id
  }
  return null
}

/** Año de una fecha de Steam como «12 Nov, 2019» o «Nov 2019». */
function yearOf(date: string | undefined): number | undefined {
  const m = date?.match(/(\d{4})/)
  return m ? Number(m[1]) : undefined
}

interface AppDetails {
  type?: string
  name?: string
  short_description?: string
  detailed_description?: string
  developers?: string[]
  publishers?: string[]
  genres?: Array<{ description?: string }>
  release_date?: { date?: string }
  screenshots?: Array<{ path_full?: string }>
  background_raw?: string
  header_image?: string
}

/** La ficha de appdetails, si es un juego base; null en otro caso. */
export function parseAppDetails(json: unknown, appid: number): AppDetails | null {
  const entry = (json as Record<string, { success?: boolean; data?: AppDetails }> | null)?.[String(appid)]
  if (!entry?.success || !entry.data || entry.data.type !== 'game') return null
  return entry.data
}

/** Datos de una ficha de Steam en el formato de los proveedores de metadatos. */
export function toMetadata(app: AppDetails, title: string): MetadataResult {
  const genre = app.genres?.map(g => g.description).filter(Boolean).join(', ') || undefined
  return {
    id: 0,
    title,
    description: stripSteamHtml(app.detailed_description) ?? stripSteamHtml(app.short_description),
    developer: app.developers?.filter(Boolean).join(', ') || undefined,
    publisher: app.publishers?.filter(Boolean).join(', ') || undefined,
    releaseYear: yearOf(app.release_date?.date),
    genre,
    screenshots: (app.screenshots ?? []).map(s => s.path_full).filter((u): u is string => Boolean(u)),
    source: 'steam',
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await providerFetch(url, { headers: { 'Accept-Language': LANG }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Steam HTTP ${res.status}`)
  return res.json()
}

/** Aplicaciones que Steam devuelve para un texto libre, para la búsqueda manual (no exacta). */
export async function searchSteamList(term: string): Promise<Array<{ id: number; name: string }>> {
  const json = await getJson(`${STORE}/api/storesearch/?term=${encodeURIComponent(term)}&l=${LANG}&cc=us`)
  const items = (json as { items?: Array<{ id?: unknown; name?: unknown; type?: unknown }> } | null)?.items ?? []
  return items
    .filter(i => (i.type === undefined || i.type === 'app') && typeof i.id === 'number' && typeof i.name === 'string')
    .slice(0, 8)
    .map(i => ({ id: i.id as number, name: i.name as string }))
}

/** El id de la aplicación de Steam para el título, o null si no hay coincidencia exacta. */
export async function searchSteamApp(title: string): Promise<number | null> {
  const json = await getJson(`${STORE}/api/storesearch/?term=${encodeURIComponent(title)}&l=${LANG}&cc=us`)
  return matchStoreSearch(json, title)
}

/** La ficha de Steam de una aplicación, en el formato de los proveedores. Null si no es un juego. */
export async function fetchSteamApp(appid: number, title: string): Promise<MetadataResult | null> {
  const json = await getJson(`${STORE}/api/appdetails?appids=${appid}&l=${LANG}&cc=us`)
  const app = parseAppDetails(json, appid)
  return app ? toMetadata(app, title) : null
}

/** La ficha de Steam para el título: busca la aplicación y luego trae sus datos. Null sin coincidencia. */
export async function lookupSteam(title: string): Promise<MetadataResult | null> {
  const appid = await searchSteamApp(title)
  if (appid === null) return null
  return fetchSteamApp(appid, title)
}

/** Imágenes de fondo de una aplicación de Steam (para la búsqueda manual del fondo). */
export async function steamBackgrounds(appid: number): Promise<Array<{ url: string; thumb: string }>> {
  const json = await getJson(`${STORE}/api/appdetails?appids=${appid}&l=${LANG}&cc=us`)
  const app = parseAppDetails(json, appid)
  if (!app?.background_raw) return []
  return [{ url: app.background_raw, thumb: app.header_image ?? app.background_raw }]
}
