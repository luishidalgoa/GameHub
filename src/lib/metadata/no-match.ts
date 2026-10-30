/**
 * Why the sources left a game without a match (Game.metadataReason). The reason
 * tells a platform that needs a LaunchBox name apart from a title nobody has and
 * from a title whose candidates all scored too low.
 */
export type NoMatchReason = 'unmapped_platform' | 'no_results' | 'below_threshold'

/** What the sources returned for one game. gatherMetadata fills it while it asks them. */
export interface MatchDiagnostics {
  /** LaunchBox has no name for this platform, so its search cannot match here. */
  launchboxUnmapped: boolean
  /** Titles LaunchBox returned for the search. */
  launchboxCandidates: number
  /** Titles RAWG returned for the search. */
  rawgCandidates: number
  /** The Nintendo store found the title (Switch only). */
  storeHit: boolean
  /** RAWG refused the key or the monthly quota during this lookup. */
  rawgRefused: boolean
}

export function emptyMatchDiagnostics(): MatchDiagnostics {
  return { launchboxUnmapped: false, launchboxCandidates: 0, rawgCandidates: 0, storeHit: false, rawgRefused: false }
}

/**
 * True when LaunchBox has no name for the platform. Game Boy is one platform here
 * but three in LaunchBox, searched through its own provider, so its missing name is
 * by design and never counts as unmapped.
 */
export function isLaunchBoxUnmapped(platformSlug: string, lbPlatformName: string | null): boolean {
  return platformSlug !== 'game-boy' && !lbPlatformName
}

/**
 * The reason for a game no source matched. An unmapped platform wins: its fix is
 * the platform name, whatever the other sources returned.
 */
export function classifyNoMatch(d: MatchDiagnostics): NoMatchReason {
  if (d.launchboxUnmapped) return 'unmapped_platform'
  const candidates = d.launchboxCandidates + d.rawgCandidates + (d.storeHit ? 1 : 0)
  return candidates === 0 ? 'no_results' : 'below_threshold'
}
