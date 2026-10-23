import type { Prisma } from '@prisma/client'
import { WITHOUT_METADATA, NO_COVER, NO_SCORE, UNFINDABLE, pendingWhere } from '@/lib/library'

export interface GameListFilters {
  search: string
  platform: string
  noScore: boolean
  noCover: boolean
  noMeta: boolean
  /** Games no source could identify: listed apart, not as pending work. */
  unfindable: boolean
}

type RawParams = Record<string, string | undefined>

/**
 * One vocabulary for the admin list, its export and the dashboard cards. The
 * dashboard and the URLs use `score|cover|meta`; the export historically used
 * `noScore|noCover|noMeta`. Both are accepted so old links keep working.
 */
export function parseGameFilters(p: RawParams): GameListFilters {
  return {
    search: p.search ?? '',
    platform: p.platform ?? '',
    noScore: p.score === 'no-score' || p.noScore === '1',
    noCover: p.cover === 'no-cover' || p.noCover === '1',
    noMeta: p.meta === 'no-metadata' || p.noMeta === '1',
    unfindable: p.meta === 'unfindable',
  }
}

/** Visible games; without a platform choice, only enabled platforms. */
export function gameListWhere(f: GameListFilters): Prisma.GameWhereInput {
  return {
    isHidden: false,
    platform: f.platform ? { slug: f.platform } : { enabled: true },
    ...(f.search && { title: { contains: f.search } }),
    ...(f.noScore && pendingWhere(NO_SCORE)),
    // "Sin portada" means neither a stored file nor a remote URL, the same test
    // the dashboard counts with.
    ...(f.noCover && pendingWhere(NO_COVER)),
    ...(f.noMeta && pendingWhere(WITHOUT_METADATA)),
    ...(f.unfindable && UNFINDABLE),
  }
}

/** Query string that reproduces the filters, plus any extra parameters. */
export function gameFilterQuery(f: GameListFilters, extra: Record<string, string> = {}): string {
  const qs = new URLSearchParams()
  if (f.search) qs.set('search', f.search)
  if (f.platform) qs.set('platform', f.platform)
  if (f.noScore) qs.set('score', 'no-score')
  if (f.noCover) qs.set('cover', 'no-cover')
  if (f.noMeta) qs.set('meta', 'no-metadata')
  // Antes se perdia al cambiar de pagina o exportar: la lista volvia a salir completa.
  if (f.unfindable) qs.set('meta', 'unfindable')
  for (const [k, v] of Object.entries(extra)) qs.set(k, v)
  return qs.toString()
}
