import type { MetadataResult } from './provider'

// Tienda europea de Nintendo (eShop en español). Su buscador Solr es público y no pide clave.
// Usamos /es/ porque da precios en EUR y las URLs de ficha en español; los precios no se leen.

export type NintendoConsole = 'switch' | 'switch-2'

const SEARCH_URL = 'https://searching.nintendo-europe.com/es/select'
const SITE = 'https://www.nintendo.com'
const TIMEOUT_MS = 15_000
const SEARCH_ROWS = 10

// Valor de `playable_on_txt` por consola. Algunos juegos llevan BEE y HAC a la vez; por eso
// cada búsqueda filtra una sola consola.
const PLAYABLE_ON: Record<NintendoConsole, string> = { switch: 'HAC', 'switch-2': 'BEE' }

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) GameHub', 'Accept-Language': 'es-ES' }

export interface NintendoHit {
  id: number
  title: string
  /** URL absoluta de la ficha de producto. */
  url: string
  console: NintendoConsole
  publisher?: string
  developer?: string
  releaseYear?: number
  /** dd-mm-yyyy tal como lo da Nintendo. */
  releaseDate?: string
  genres: string[]
  languages: string[]
  ageRating?: string
  images: { square?: string; packshot?: string; banner?: string }
}

/** Consola de la tienda para un slug de plataforma de GameHub, o null si Nintendo no tiene tienda para ella. */
export function nintendoConsoleOf(slug: string): NintendoConsole | null {
  if (slug === 'switch') return 'switch'
  if (slug === 'switch-2') return 'switch-2'
  return null
}

/** Clave comparable de un título: minúsculas, sin acentos, solo letras y dígitos. */
export function storeKey(title: string): string {
  return title
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Helpers de lectura: el JSON de Solr mezcla strings, arrays y nulls según el documento.
function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t || undefined
}

function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).filter((x): x is string => x !== undefined)
  const s = str(v)
  return s ? [s] : []
}

/** Año de estreno: primero la fecha ISO, si no, el año dentro de la fecha dd-mm-yyyy. */
function releaseYearOf(doc: Record<string, unknown>): number | undefined {
  const iso = strList(doc.dates_released_dts)[0]
  const fromIso = iso ? Number(iso.slice(0, 4)) : NaN
  if (Number.isFinite(fromIso)) return fromIso
  const m = str(doc.pretty_date_s)?.match(/(\d{4})/)
  return m ? Number(m[1]) : undefined
}

/** Idiomas separados por comas: el campo llega como string o como array de strings. */
function languagesOf(v: unknown): string[] {
  return strList(v)
    .flatMap(s => s.split(','))
    .map(s => s.trim())
    .filter(Boolean)
}

/**
 * Hits de una respuesta Solr. Solo cuenta type GAME (DLC, bundles y demos no son la ficha del juego).
 * Pura: no hace red, así que se prueba con la fixture.
 */
export function parseSolrHits(json: unknown, console: NintendoConsole): NintendoHit[] {
  const docs = (json as { response?: { docs?: unknown } } | null)?.response?.docs
  if (!Array.isArray(docs)) return []
  const hits: NintendoHit[] = []
  for (const raw of docs) {
    if (!raw || typeof raw !== 'object') continue
    const doc = raw as Record<string, unknown>
    if (doc.type !== 'GAME') continue
    const id = Number(doc.fs_id)
    const title = str(doc.title)
    const path = str(doc.url)
    // Sin id, título o ruta no hay ficha que enlazar.
    if (!Number.isFinite(id) || !title || !path) continue
    const images: NintendoHit['images'] = {}
    const square = str(doc.image_url_sq_s)
    const packshot = str(doc.image_url)
    const banner = str(doc.image_url_h2x1_s)
    if (square) images.square = square
    if (packshot) images.packshot = packshot
    if (banner) images.banner = banner
    hits.push({
      id,
      title,
      url: path.startsWith('http') ? path : `${SITE}${path}`,
      console,
      publisher: str(doc.publisher),
      developer: str(doc.developer),
      releaseYear: releaseYearOf(doc),
      releaseDate: str(doc.pretty_date_s),
      genres: strList(doc.pretty_game_categories_txt),
      languages: languagesOf(doc.language_availability),
      ageRating: str(doc.pretty_agerating_s),
      images,
    })
  }
  return hits
}

/** Una consulta Solr filtrada a una consola. Lanza si Nintendo responde con error HTTP. */
async function solrSelect(q: string, console: NintendoConsole, extra: Record<string, string>): Promise<NintendoHit[]> {
  const params = new URLSearchParams({
    q,
    fq: `type:GAME AND (playable_on_txt:"${PLAYABLE_ON[console]}") AND sorting_title:* AND *:*`,
    wt: 'json',
    ...extra,
  })
  const res = await fetch(`${SEARCH_URL}?${params}`, {
    headers: HEADERS,
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} en la búsqueda de Nintendo`)
  return parseSolrHits(await res.json(), console)
}

/** Busca un título en una consola. Término entre comillas (sin ellas Solr devuelve miles de resultados). */
export async function searchNintendo(term: string, console: NintendoConsole, limit = SEARCH_ROWS): Promise<NintendoHit[]> {
  const phrase = term.replace(/"/g, ' ').trim()
  if (!phrase) return []
  return solrSelect(`"${phrase}"`, console, { sort: 'score desc', rows: String(limit) })
}

/** Ficha por id de Nintendo (fs_id) en una consola, o null si no existe para esa consola. */
export async function fetchNintendoById(id: number, console: NintendoConsole): Promise<NintendoHit | null> {
  if (!Number.isInteger(id) || id <= 0) return null
  const [hit] = await solrSelect(`fs_id:${id}`, console, { rows: '1' })
  return hit && hit.id === id ? hit : null
}

/** El hit cuya clave coincide exactamente con el título, o null. Sin coincidencias aproximadas. */
export function matchExact(hits: NintendoHit[], title: string): NintendoHit | null {
  const key = storeKey(title)
  if (!key) return null
  return hits.find(h => storeKey(h.title) === key) ?? null
}

/** Ficha de la tienda cuyo nombre coincide con el título en la consola indicada, o null. */
export async function findNintendoExact(title: string, console: NintendoConsole): Promise<NintendoHit | null> {
  return matchExact(await searchNintendo(title, console), title)
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  iquest: '¿', iexcl: '¡', ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', ndash: '–', mdash: '—',
  copy: '©', reg: '®', trade: '™', bull: '•', middot: '·', laquo: '«', raquo: '»',
  ccedil: 'ç', Ccedil: 'Ç', ordm: 'º', ordf: 'ª',
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z]+);/gi, (all, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : all
    }
    return ENTITIES[body] ?? all
  })
}

/** Galería: cada `image_url` de los `_gItems.push(...)` de la página, en orden y sin repetir. */
export function parseGallery(html: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const [, body] of html.matchAll(/_gItems\.push\(\{([\s\S]*?)\}\)/g)) {
    const m = body.match(/['"]image_url['"]\s*:\s*['"]([^'"]+)['"]/)
    if (!m) continue
    const url = decodeEntities(m[1]).trim()
    // Solo imágenes absolutas de Nintendo: los thumbnails van por otro campo.
    if (!/^https:\/\/www\.nintendo\.com\//.test(url) || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

/**
 * Descripción de la sección "overview". Corta antes de las advertencias legales,
 * que están dentro de la misma sección. Devuelve el texto completo, sin truncar.
 */
export function parseOverview(html: string): string | undefined {
  const start = html.search(/data-section-type="overview"/)
  if (start < 0) return undefined
  // Desde el fin de la etiqueta <section ...>, no desde el atributo.
  const rest = html.slice(start).replace(/^[^>]*>/, '')
  // El bloque de advertencias empieza con su <div v-if="hasDisclaimers">: cortamos antes de esa etiqueta.
  const end = rest.search(/<\/section>|<div[^>]*v-if="hasDisclaimers"/)
  const block = end < 0 ? rest : rest.slice(0, end)
  const text = decodeEntities(
    block
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
      // Una etiqueta cortada por el borde del bloque (sin «>») también sale: no queda texto de HTML.
      .replace(/<\/?[a-zA-Z][^>]*>?/g, ''),
  )
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
  return text || undefined
}

/**
 * Galería y descripción de la ficha. Nunca lanza: cualquier fallo de red o de página
 * devuelve vacío, porque la ficha de Nintendo es opcional frente al resto de datos.
 */
export async function fetchNintendoPage(url: string): Promise<{ gallery: string[]; description?: string }> {
  // Solo fichas de Nintendo: la URL viene de un hit, pero no queremos abrir cualquier host.
  if (!url.startsWith(`${SITE}/`)) return { gallery: [], description: undefined }
  try {
    const res = await fetch(url, { headers: HEADERS, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return { gallery: [], description: undefined }
    const html = await res.text()
    return { gallery: parseGallery(html), description: parseOverview(html) }
  } catch {
    return { gallery: [], description: undefined }
  }
}

/** Un hit con el shape de los proveedores de metadatos. La galería va en screenshots y el cover es el cuadrado eShop. */
export function nintendoMetadata(hit: NintendoHit, gallery?: string[], description?: string): MetadataResult {
  const out: MetadataResult = {
    id: hit.id,
    title: hit.title,
    source: 'nintendo',
    platformSlugs: [hit.console],
    screenshots: gallery ?? [],
  }
  if (hit.developer) out.developer = hit.developer
  if (hit.publisher) out.publisher = hit.publisher
  if (hit.releaseYear !== undefined) out.releaseYear = hit.releaseYear
  if (hit.genres.length) out.genre = hit.genres.join(', ')
  if (description) out.description = description
  const cover = hit.images.square ?? hit.images.packshot
  if (cover) out.coverUrl = cover
  return out
}
