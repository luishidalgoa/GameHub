import type { Prisma } from '@prisma/client'
import { WITHOUT_METADATA, NO_COVER, NO_SCORE, UNFINDABLE, pendingWhere } from '@/lib/library'
import { completeness, FIELD_WEIGHTS, type CompletenessInput, type FieldKey } from '@/lib/games/completeness'

export interface GameListFilters {
  search: string
  platform: string
  noScore: boolean
  noCover: boolean
  noMeta: boolean
  /** Games no source could identify: listed apart, not as pending work. */
  unfindable: boolean
  /** "Les falta": a game must lack every field listed here. */
  missing: FieldKey[]
  /** "Metadatos al menos": 0 means no minimum. */
  minMeta: number
  /** '' and 'visible' list the visible games; 'hidden' the cementerio. */
  state: '' | 'visible' | 'hidden'
  region: string
}

type RawParams = Record<string, string | undefined>

const FIELD_KEYS = new Set<string>(FIELD_WEIGHTS.map(f => f.key))

/**
 * One vocabulary for the admin list, its export and the dashboard cards. The
 * dashboard and the URLs use `score|cover|meta`; the export historically used
 * `noScore|noCover|noMeta`. Both are accepted so old links keep working.
 */
export function parseGameFilters(p: RawParams): GameListFilters {
  const missing = (p.missing ?? '').split(',').filter((k): k is FieldKey => FIELD_KEYS.has(k))
  const minRaw = parseInt(p.meta_min ?? '0', 10)
  return {
    search: p.search ?? '',
    platform: p.platform ?? '',
    noScore: p.score === 'no-score' || p.noScore === '1',
    noCover: p.cover === 'no-cover' || p.noCover === '1',
    noMeta: p.meta === 'no-metadata' || p.noMeta === '1',
    unfindable: p.meta === 'unfindable',
    missing: [...new Set(missing)],
    minMeta: Number.isFinite(minRaw) ? Math.min(100, Math.max(0, minRaw)) : 0,
    state: p.estado === 'hidden' ? 'hidden' : p.estado === 'visible' ? 'visible' : '',
    region: p.region ?? '',
  }
}

/** Visible games; without a platform choice, only enabled platforms. */
export function gameListWhere(f: GameListFilters): Prisma.GameWhereInput {
  return {
    isHidden: f.state === 'hidden',
    platform: f.platform ? { slug: f.platform } : { enabled: true },
    ...(f.search && { title: { contains: f.search } }),
    ...(f.noScore && pendingWhere(NO_SCORE)),
    // "Sin portada" means neither a stored file nor a remote URL, the same test
    // the dashboard counts with.
    ...(f.noCover && pendingWhere(NO_COVER)),
    ...(f.noMeta && pendingWhere(WITHOUT_METADATA)),
    ...(f.unfindable && UNFINDABLE),
    ...(f.region && { region: f.region }),
  }
}

/**
 * The filters that count fields: the page reads the games once and applies these
 * in memory, because the score is a sum over several columns.
 */
export function filterByCompleteness<T extends CompletenessInput & { region: string | null }>(games: T[], f: GameListFilters): T[] {
  return games.filter(g => {
    if (f.missing.length > 0 && !f.missing.every(k => completeness(g).missing.includes(k))) return false
    if (f.minMeta > 0 && completeness(g).percent < f.minMeta) return false
    return true
  })
}

/** Query string that reproduces the filters, plus any extra parameters. */
export function gameFilterQuery(f: GameListFilters, extra: Record<string, string> = {}): string {
  const qs = new URLSearchParams()
  if (f.search) qs.set('search', f.search)
  if (f.platform) qs.set('platform', f.platform)
  if (f.noScore) qs.set('score', 'no-score')
  if (f.noCover) qs.set('cover', 'no-cover')
  // `meta` takes one value: the unfindable filter wins over the no-metadata one.
  if (f.unfindable) qs.set('meta', 'unfindable')
  else if (f.noMeta) qs.set('meta', 'no-metadata')
  if (f.missing.length > 0) qs.set('missing', f.missing.join(','))
  if (f.minMeta > 0) qs.set('meta_min', String(f.minMeta))
  if (f.state) qs.set('estado', f.state)
  if (f.region) qs.set('region', f.region)
  for (const [k, v] of Object.entries(extra)) qs.set(k, v)
  return qs.toString()
}
