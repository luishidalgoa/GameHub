import type { ScoreSource } from './scoreChain'

/** One score the admin can pick in the manual search box. */
export interface ScoreCandidate {
  title: string
  releaseYear: number | null
  /** Platform names, joined for display ("Nintendo Switch, PC"). Empty when unknown. */
  platforms: string
  score: number
  source: ScoreSource
}

export const SCORE_SOURCE_LABEL: Record<ScoreSource, string> = {
  rawg: 'RAWG',
  metacritic: 'Metacritic (crítica)',
  launchbox: 'LaunchBox (usuarios)',
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Drops anything that is not a 0–100 score, and puts candidates whose title is
 * exactly the query first. The rest keep the order their source gave them.
 */
export function rankScoreCandidates(list: ScoreCandidate[], query: string): ScoreCandidate[] {
  const q = normalize(query)
  return list
    .filter((c) => Number.isFinite(c.score) && c.score >= 0 && c.score <= 100)
    .map((c, index) => ({ c, index, exact: normalize(c.title) === q }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || a.index - b.index)
    .map((x) => x.c)
}
