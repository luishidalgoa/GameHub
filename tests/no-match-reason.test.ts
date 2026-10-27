import { describe, it, expect } from 'vitest'
import { classifyNoMatch, emptyMatchDiagnostics, isLaunchBoxUnmapped } from '@/lib/metadata/no-match'

describe('why a game found no match', () => {
  it('no candidate from any source is no_results', () => {
    expect(classifyNoMatch(emptyMatchDiagnostics())).toBe('no_results')
  })

  it('candidates that all scored too low are below_threshold', () => {
    expect(classifyNoMatch({ ...emptyMatchDiagnostics(), launchboxCandidates: 3 })).toBe('below_threshold')
    expect(classifyNoMatch({ ...emptyMatchDiagnostics(), rawgCandidates: 1 })).toBe('below_threshold')
    expect(classifyNoMatch({ ...emptyMatchDiagnostics(), storeHit: true })).toBe('below_threshold')
  })

  it('an unmapped platform wins, even when RAWG had candidates', () => {
    expect(classifyNoMatch({ ...emptyMatchDiagnostics(), launchboxUnmapped: true })).toBe('unmapped_platform')
    expect(classifyNoMatch({ ...emptyMatchDiagnostics(), launchboxUnmapped: true, rawgCandidates: 2 })).toBe('unmapped_platform')
  })
})

describe('LaunchBox is unmapped only for a platform it has no name for', () => {
  it('game-boy is never unmapped, its three LaunchBox platforms are searched by their own provider', () => {
    expect(isLaunchBoxUnmapped('game-boy', null)).toBe(false)
    expect(isLaunchBoxUnmapped('game-boy', 'Nintendo Game Boy')).toBe(false)
  })

  it('a platform with no LaunchBox name is unmapped (psvita-ports has no alias)', () => {
    expect(isLaunchBoxUnmapped('psvita-ports', null)).toBe(true)
  })

  it('a platform with a LaunchBox name is mapped', () => {
    expect(isLaunchBoxUnmapped('psvita-ports', 'Sony Playstation Vita')).toBe(false)
    expect(isLaunchBoxUnmapped('ps2', 'Sony Playstation 2')).toBe(false)
  })
})
