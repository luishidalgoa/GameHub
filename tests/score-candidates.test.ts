import { describe, expect, it } from 'vitest'
import { rankScoreCandidates, type ScoreCandidate } from '@/lib/metadata/score-candidates'

function cand(title: string, score: number, source: ScoreCandidate['source'] = 'metacritic'): ScoreCandidate {
  return { title, releaseYear: null, platforms: '', score, source }
}

describe('rankScoreCandidates', () => {
  it('drops scores outside 0–100 and non-numbers', () => {
    const out = rankScoreCandidates([cand('A', 80), cand('B', 101), cand('C', -1), cand('D', NaN)], 'x')
    expect(out.map((c) => c.title)).toEqual(['A'])
  })

  it('puts an exact title match first, keeping the source order for the rest', () => {
    const out = rankScoreCandidates(
      [cand('Super Mario Odyssey DLC', 70), cand('Super Mario Odyssey', 97), cand('Other', 60)],
      'super mario odyssey',
    )
    expect(out.map((c) => c.title)).toEqual(['Super Mario Odyssey', 'Super Mario Odyssey DLC', 'Other'])
  })

  it('ignores case and punctuation when comparing the title', () => {
    const out = rankScoreCandidates([cand('Other', 50), cand('Pokémon: Sol', 85)], 'pokemon sol')
    expect(out[0].title).toBe('Pokémon: Sol')
  })

  it('returns nothing for an empty list', () => {
    expect(rankScoreCandidates([], 'x')).toEqual([])
  })
})
