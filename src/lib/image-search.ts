/**
 * Búsqueda de imágenes para el arte de las editoras (Brave Search API). La clave va en
 * BRAVE_SEARCH_API_KEY, en el entorno del servidor: nunca llega al navegador. Las miniaturas
 * las sirve Brave; la imagen completa se descarga al importarla (ver remote-image.ts).
 */

export interface ImageHit {
  /** Miniatura, para mostrarla en la lista. */
  thumb: string
  /** La imagen completa, la que se importa. */
  full: string
  title: string
  source: string
}

export class ImageSearchError extends Error {
  constructor(readonly code: 'no-key' | 'http' | 'network', detail?: string) {
    super(detail ?? code)
  }
}

interface BraveImage {
  title?: string
  url?: string
  source?: string
  meta_url?: { hostname?: string }
  thumbnail?: { src?: string }
  properties?: { url?: string }
}

export async function searchImages(query: string, count = 30): Promise<ImageHit[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY
  if (!key) throw new ImageSearchError('no-key')

  const url = new URL('https://api.search.brave.com/res/v1/images/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(count))
  url.searchParams.set('safesearch', 'strict')

  let res: Response
  try {
    res = await fetch(url, { headers: { 'X-Subscription-Token': key, Accept: 'application/json' }, cache: 'no-store' })
  } catch (err) {
    throw new ImageSearchError('network', err instanceof Error ? err.message : undefined)
  }
  if (!res.ok) throw new ImageSearchError('http', `Brave respondió ${res.status}`)

  const data = await res.json() as { results?: BraveImage[] }
  const hits: ImageHit[] = []
  for (const r of data.results ?? []) {
    const full = r.properties?.url ?? r.url
    const thumb = r.thumbnail?.src
    if (!full || !thumb) continue
    hits.push({ thumb, full, title: r.title ?? '', source: r.source ?? r.meta_url?.hostname ?? '' })
  }
  return hits
}
