import { db } from '@/lib/db'
import { providerFetch } from './http'
import { noMatchRetryAt } from './retry'
import { applyMetadata, type MetadataPatch } from './apply'

/**
 * Wikidata as a free fallback for the facts a game is missing: developer, publisher,
 * release year and genre. Its data is CC0 and needs no key. A game is only matched
 * when exactly one video game in Wikidata has the same title, so a common name
 * never fills a game with another game's facts. Only empty fields are written.
 */

const API = 'https://www.wikidata.org/w/api.php'
const PROP = { developer: 'P178', publisher: 'P123', date: 'P577', genre: 'P136' } as const

export interface WikidataFacts {
  developer?: string
  publisher?: string
  releaseYear?: number
  genre?: string
}

/** Lowercase, accent-free, punctuation-free key for comparing titles. */
export function sameTitleKey(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

async function api<T>(params: Record<string, string>): Promise<T | null> {
  const res = await providerFetch(`${API}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`)
  return res.ok ? (await res.json()) as T : null
}

/** The single Wikidata video game whose label is exactly this title, or null. */
async function findGame(title: string): Promise<string | null> {
  const found = await api<{ search: { id: string; label?: string; description?: string }[] }>({
    action: 'wbsearchentities', search: title, language: 'en', type: 'item', limit: '10',
  })
  const key = sameTitleKey(title)
  const games = (found?.search ?? []).filter(c =>
    sameTitleKey(c.label ?? '') === key && /video game/i.test(c.description ?? ''),
  )
  const unique = [...new Set(games.map(g => g.id))]
  return unique.length === 1 ? unique[0] : null
}

type Claim = { mainsnak?: { datavalue?: { value?: unknown } } }
type Entity = { claims?: Record<string, Claim[]>; labels?: Record<string, { value: string }> }

const itemIds = (claims: Record<string, Claim[]> | undefined, prop: string): string[] =>
  (claims?.[prop] ?? [])
    .map(c => (c.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id)
    .filter((id): id is string => !!id)

async function labelsOf(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  const res = await api<{ entities: Record<string, Entity> }>({
    action: 'wbgetentities', ids: [...new Set(ids)].slice(0, 50).join('|'), props: 'labels', languages: 'en',
  })
  for (const [id, e] of Object.entries(res?.entities ?? {})) {
    const label = e.labels?.en?.value
    if (label) out.set(id, label)
  }
  return out
}

/** The facts of one Wikidata game, or null when it cannot be matched to exactly one. */
export async function wikidataFacts(title: string): Promise<WikidataFacts | null> {
  const id = await findGame(title)
  if (!id) return null
  const res = await api<{ entities: Record<string, Entity> }>({
    action: 'wbgetentities', ids: id, props: 'claims',
  })
  const claims = res?.entities?.[id]?.claims
  if (!claims) return null

  const labels = await labelsOf([
    ...itemIds(claims, PROP.developer).slice(0, 1),
    ...itemIds(claims, PROP.publisher).slice(0, 1),
    ...itemIds(claims, PROP.genre).slice(0, 3),
  ])
  const first = (prop: string) => {
    const ids = itemIds(claims, prop)
    return ids.length ? labels.get(ids[0]) : undefined
  }
  const dateValue = (claims[PROP.date]?.[0]?.mainsnak?.datavalue?.value as { time?: string } | undefined)?.time
  const year = dateValue ? parseInt(dateValue.replace(/^\+/, '').slice(0, 4), 10) : NaN
  const genres = itemIds(claims, PROP.genre).slice(0, 3)
    .map(g => labels.get(g)).filter((g): g is string => !!g)
    .map(g => g.charAt(0).toUpperCase() + g.slice(1))

  return {
    developer: first(PROP.developer),
    publisher: first(PROP.publisher),
    releaseYear: Number.isFinite(year) && year > 1950 ? year : undefined,
    genre: genres.length ? genres.join(', ') : undefined,
  }
}

/**
 * A game is ready for the Wikidata fallback once the metadata pass has run its
 * platform's providers on it: fetched, or found nothing. Until then, Wikidata would
 * fill a field the preferred provider was meant to fill first.
 */
export function readyForWikidata(game: { metadataFetchedAt: Date | string | null; metadataStatus: string | null }): boolean {
  return game.metadataFetchedAt != null || game.metadataStatus === 'no_match'
}

/** Fills the empty facts of one game from Wikidata. Returns the fields it wrote. */
export async function fillGameFacts(gameId: number): Promise<string[]> {
  const game = await db.game.findUnique({
    where: { id: gameId },
    select: { title: true, developer: true, publisher: true, releaseYear: true, genre: true },
  })
  if (!game) return []
  if (game.developer && game.publisher && game.releaseYear && game.genre) return []

  const facts = await wikidataFacts(game.title)
  if (!facts) {
    // Nothing matched: one more attempt on the record. A game that has none of the
    // sources is "unfindable" (see UNFINDABLE), not a pending job.
    await db.game.update({
      where: { id: gameId },
      data: { metadataStatus: 'no_match', metadataAttempts: { increment: 1 }, metadataNextRetryAt: noMatchRetryAt() },
    })
    return []
  }
  // Each fact carries its own source, so the editor labels it as Wikidata's (#133).
  const patch: MetadataPatch = {}
  if (!game.developer   && facts.developer)   patch.developer   = { value: facts.developer,   source: 'wikidata' }
  if (!game.publisher   && facts.publisher)   patch.publisher   = { value: facts.publisher,   source: 'wikidata' }
  if (!game.releaseYear && facts.releaseYear) patch.releaseYear = { value: facts.releaseYear, source: 'wikidata' }
  if (!game.genre       && facts.genre)       patch.genre       = { value: facts.genre,       source: 'wikidata' }
  await applyMetadata(gameId, { origin: 'auto', patch, data: { metadataStatus: 'matched' } })
  return Object.keys(patch)
}
