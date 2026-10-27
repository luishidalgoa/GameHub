// The platform grid's filters, kept in the URL so a back navigation (from the game
// editor, a ficha, or the browser) comes back to the same view.

export type GridSort = 'title' | 'year' | 'size' | 'popularity' | 'rating'
export type GridOrigin = '' | 'local' | 'torrent' | 'lot'

export interface GridFilters {
  search:     string
  sort:       GridSort
  favOnly:    boolean
  onlineOnly: boolean
  origin:     GridOrigin
  region:     string
  genre:      string
  minRating:  string
}

const SORTS: readonly GridSort[] = ['title', 'year', 'size', 'popularity', 'rating']
const ORIGINS: readonly GridOrigin[] = ['', 'local', 'torrent', 'lot']
// Free-text values come from the URL: cap them so a long query string cannot
// balloon the request or the storage key.
const MAX_TEXT = 120

/** Anything with `get(name)`: URLSearchParams, or Next's read-only params. */
export interface ParamReader {
  get(name: string): string | null
}

function text(v: string | null): string {
  return (v ?? '').slice(0, MAX_TEXT)
}

/** Reads the filters from the URL. Unknown or malformed values fall back to the default. */
export function gridFiltersFromQuery(params: ParamReader): GridFilters {
  const sort = params.get('sort') ?? ''
  const source = params.get('source') ?? ''
  return {
    search:     text(params.get('q')),
    sort:       (SORTS as readonly string[]).includes(sort) ? sort as GridSort : 'title',
    favOnly:    params.get('fav') === '1',
    onlineOnly: params.get('online') === '1',
    origin:     (ORIGINS as readonly string[]).includes(source) ? source as GridOrigin : '',
    region:     text(params.get('region')),
    genre:      text(params.get('genre')),
    minRating:  text(params.get('minRating')),
  }
}

/** The query string for the filters. Defaults are left out, so the default view has no query. */
export function gridFiltersToQuery(f: GridFilters): string {
  const p = new URLSearchParams()
  if (f.search)     p.set('q', f.search)
  if (f.sort !== 'title') p.set('sort', f.sort)
  if (f.favOnly)    p.set('fav', '1')
  if (f.onlineOnly) p.set('online', '1')
  if (f.origin)     p.set('source', f.origin)
  if (f.region)     p.set('region', f.region)
  if (f.genre)      p.set('genre', f.genre)
  if (f.minRating)  p.set('minRating', f.minRating)
  return p.toString()
}

/**
 * A `volver` target that is safe to navigate to: a path on this site only.
 * Anything that could leave the site (`//host`, `http:`, backslashes, line breaks) is refused.
 */
export function safeReturnPath(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || v.length === 0 || v.length > 2048) return null
  if (!v.startsWith('/') || v.startsWith('//')) return null
  if (v.includes('\\') || /[\r\n]/.test(v)) return null
  return v
}
