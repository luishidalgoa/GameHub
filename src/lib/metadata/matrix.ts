import { db } from '@/lib/db'

// Per-field metadata provider selection. Each category of data can come from a
// different source, picked for what that source does best:
//   - cover:       box-art front     → LaunchBox / SteamGridDB / RAWG
//   - info:        dev/publisher/genre/year/ESRB → LaunchBox / RAWG
//   - description: long overview     → RAWG (richer) / LaunchBox
//   - screenshots: gameplay images   → LaunchBox / RAWG / none
//
// Stored in the Setting table (keys below). Each field falls back to the other
// available source if the chosen one returns nothing for a given game.

export type CoverProvider = 'launchbox' | 'steamgriddb' | 'rawg'
export type InfoProvider = 'launchbox' | 'rawg'
export type DescProvider = 'launchbox' | 'rawg'
export type ShotProvider = 'launchbox' | 'rawg' | 'none'

export interface ProviderMatrix {
  cover: CoverProvider
  info: InfoProvider
  description: DescProvider
  screenshots: ShotProvider
}

export const PROVIDER_MATRIX_KEYS = {
  cover:       'provider_cover',
  info:        'provider_info',
  description: 'provider_description',
  screenshots: 'provider_screenshots',
} as const

// Defaults: LaunchBox leads on covers/info/screenshots; RAWG leads on the long
// description (its overviews are richer than LaunchBox's meta description).
export const DEFAULT_MATRIX: ProviderMatrix = {
  cover:       'launchbox',
  info:        'launchbox',
  description: 'rawg',
  screenshots: 'launchbox',
}

const COVER_OPTS: CoverProvider[] = ['launchbox', 'steamgriddb', 'rawg']
const INFO_OPTS:  InfoProvider[]  = ['launchbox', 'rawg']
const DESC_OPTS:  DescProvider[]  = ['launchbox', 'rawg']
const SHOT_OPTS:  ShotProvider[]  = ['launchbox', 'rawg', 'none']

const oneOf = <T extends string>(v: string | undefined, opts: T[], fallback: T): T =>
  v && (opts as string[]).includes(v) ? (v as T) : fallback

/** Read the provider matrix from the DB (falling back to DEFAULT_MATRIX). */
export async function getProviderMatrix(): Promise<ProviderMatrix> {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.values(PROVIDER_MATRIX_KEYS) } },
  })
  const get = (k: string) => rows.find(r => r.key === k)?.value
  return {
    cover:       oneOf(get(PROVIDER_MATRIX_KEYS.cover),       COVER_OPTS, DEFAULT_MATRIX.cover),
    info:        oneOf(get(PROVIDER_MATRIX_KEYS.info),        INFO_OPTS,  DEFAULT_MATRIX.info),
    description: oneOf(get(PROVIDER_MATRIX_KEYS.description), DESC_OPTS,  DEFAULT_MATRIX.description),
    screenshots: oneOf(get(PROVIDER_MATRIX_KEYS.screenshots), SHOT_OPTS,  DEFAULT_MATRIX.screenshots),
  }
}

/** True if any field is sourced from LaunchBox. */
export const usesLaunchBox = (m: ProviderMatrix): boolean =>
  m.cover === 'launchbox' || m.info === 'launchbox' || m.description === 'launchbox' || m.screenshots === 'launchbox'

/** True if any field is sourced from RAWG. */
export const usesRawg = (m: ProviderMatrix): boolean =>
  m.cover === 'rawg' || m.info === 'rawg' || m.description === 'rawg' || m.screenshots === 'rawg'
