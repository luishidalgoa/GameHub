import type { MetadataResult } from './provider'

// Tienda oficial de Nintendo (EE. UU.): solo Switch. Las eShop de 3DS y Wii U cerraron en 2023,
// así que el sitemap no tiene fichas de esas consolas. El índice sale del sitemap; cada ficha
// trae editora, desarrollador, fecha y la imagen de producto en su JSON embebido.

const SITEMAP = 'https://www.nintendo.com/us/store/sitemap.xml'
const INDEX_TTL_MS = 24 * 60 * 60 * 1000
const SWITCH_SUFFIX = /-(switch-2|switch|nintendo-switch)$/

interface StoreEntry { url: string; switch2: boolean }

let index: { at: number; map: Map<string, StoreEntry> } | null = null

/** Clave comparable de un título: minúsculas, sin acentos, palabras separadas por guiones. */
export function storeKey(title: string): string {
  return title
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Clave de una URL de ficha de Switch: su slug sin el sufijo de plataforma. */
export function slugKey(url: string): { key: string; switch2: boolean } | null {
  const slug = url.replace(/\/$/, '').split('/').pop() ?? ''
  const m = slug.match(SWITCH_SUFFIX)
  if (!m) return null
  return { key: slug.slice(0, -m[0].length).replace(/-\d{6,}$/, ''), switch2: m[1] === 'switch-2' }
}

async function loadIndex(): Promise<Map<string, StoreEntry>> {
  if (index && Date.now() - index.at < INDEX_TTL_MS) return index.map
  const res = await fetch(SITEMAP, { cache: 'no-store', signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} en el sitemap de Nintendo`)
  const xml = await res.text()
  const map = new Map<string, StoreEntry>()
  for (const [, url] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    if (!url.includes('/store/products/')) continue
    const parsed = slugKey(url)
    if (!parsed) continue
    const prev = map.get(parsed.key)
    // Si hay edición Switch 2 y la normal, gana la normal.
    if (!prev || (prev.switch2 && !parsed.switch2)) map.set(parsed.key, { url, switch2: parsed.switch2 })
  }
  index = { at: Date.now(), map }
  return map
}

/** Ficha de la tienda cuyo nombre coincide exactamente con el título, o null. */
export async function searchStore(title: string): Promise<{ id: number; url: string } | null> {
  const key = storeKey(title)
  if (key.length < 3) return null
  const hit = (await loadIndex()).get(key)
  if (!hit) return null
  return { id: 0, url: hit.url }
}

interface StoreProduct {
  title?: string
  softwareDeveloper?: string
  softwarePublisher?: string
  releaseDate?: string
  productImage?: { publicId?: string }
}

function findProduct(node: unknown): StoreProduct | null {
  if (Array.isArray(node)) {
    for (const x of node) { const f = findProduct(x); if (f) return f }
    return null
  }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if ('softwarePublisher' in o || 'softwareDeveloper' in o) return o as StoreProduct
    for (const v of Object.values(o)) { const f = findProduct(v); if (f) return f }
  }
  return null
}

/** Datos de una ficha de la tienda, en el formato de los proveedores de metadatos. */
export async function fetchStoreProduct(url: string): Promise<MetadataResult | null> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
  if (!res.ok) return null
  const html = await res.text()
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return null
  const product = findProduct(JSON.parse(m[1]))
  if (!product) return null
  const year = product.releaseDate ? Number(product.releaseDate.slice(0, 4)) : NaN
  const publicId = product.productImage?.publicId
  return {
    id: 0,
    title: product.title ?? '',
    developer: product.softwareDeveloper || undefined,
    publisher: product.softwarePublisher || undefined,
    releaseYear: Number.isFinite(year) ? year : undefined,
    coverUrl: publicId ? `https://assets.nintendo.com/image/upload/${publicId}` : undefined,
    source: 'nintendo',
    platformSlugs: ['switch'],
  }
}
