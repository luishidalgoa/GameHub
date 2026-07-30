import { db } from '@/lib/db'

// Per-field metadata provider selection. Each category of data can come from a
// different source, picked for what that source does best:
//   - cover:       box-art front     → libretro / LaunchBox / SteamGridDB / RAWG
//   - info:        dev/publisher/genre/year/ESRB → LaunchBox / RAWG
//   - description: long overview     → RAWG (richer) / LaunchBox
//   - screenshots: gameplay images   → LaunchBox / RAWG / none
//
// Stored in the Setting table (keys below) as the global default, and
// overridable per platform via the nullable `provider*` columns on Platform:
// the best source depends on the console. libretro is indexed per system and is
// the only one that guarantees the right platform's box, but has no Switch data
// at all; LaunchBox is thin on Japan-only releases. Each field still falls back
// to the other available sources if the chosen one returns nothing.

// 'libretro' is indexed by system and by No-Intro file name, so it returns the
// box that shipped for *this* console in its real proportions, where the others
// index by game and can hand a GBA cartridge the PS2 cover. No Switch data.
export type CoverProvider = 'launchbox' | 'steamgriddb' | 'rawg' | 'libretro'
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

const COVER_OPTS: CoverProvider[] = ['launchbox', 'steamgriddb', 'rawg', 'libretro']
const INFO_OPTS:  InfoProvider[]  = ['launchbox', 'rawg']
const DESC_OPTS:  DescProvider[]  = ['launchbox', 'rawg']
const SHOT_OPTS:  ShotProvider[]  = ['launchbox', 'rawg', 'none']

const oneOf = <T extends string>(v: string | undefined, opts: T[], fallback: T): T =>
  v && (opts as string[]).includes(v) ? (v as T) : fallback

/**
 * The provider matrix in force for a platform.
 *
 * Resolution order per field: the platform's own override, then the global
 * setting, then the built-in default. A platform column that is NULL — or holds
 * a value no longer offered — simply inherits, so removing an option from the UI
 * can never strand a platform on something the code doesn't understand.
 *
 * Call it without a slug for the global matrix (e.g. to render the settings
 * form).
 */
export async function getProviderMatrix(platformSlug?: string): Promise<ProviderMatrix> {
  const [rows, platform] = await Promise.all([
    db.setting.findMany({ where: { key: { in: Object.values(PROVIDER_MATRIX_KEYS) } } }),
    platformSlug
      ? db.platform.findUnique({
          where:  { slug: platformSlug },
          select: {
            providerCover: true, providerInfo: true,
            providerDescription: true, providerScreenshots: true,
          },
        })
      : Promise.resolve(null),
  ])

  const global = (k: string) => rows.find(r => r.key === k)?.value

  // `?? undefined` so an empty override falls through to the global value
  // rather than being validated as an empty string.
  const pick = (override: string | null | undefined, key: string) =>
    override || global(key) || undefined

  return {
    cover:       oneOf(pick(platform?.providerCover,       PROVIDER_MATRIX_KEYS.cover),       COVER_OPTS, DEFAULT_MATRIX.cover),
    info:        oneOf(pick(platform?.providerInfo,        PROVIDER_MATRIX_KEYS.info),        INFO_OPTS,  DEFAULT_MATRIX.info),
    description: oneOf(pick(platform?.providerDescription, PROVIDER_MATRIX_KEYS.description), DESC_OPTS,  DEFAULT_MATRIX.description),
    screenshots: oneOf(pick(platform?.providerScreenshots, PROVIDER_MATRIX_KEYS.screenshots), SHOT_OPTS,  DEFAULT_MATRIX.screenshots),
  }
}

/** Option lists, exported so the settings UI and the API validate identically. */
export const PROVIDER_OPTIONS = {
  cover:       COVER_OPTS,
  info:        INFO_OPTS,
  description: DESC_OPTS,
  screenshots: SHOT_OPTS,
} as const

/** Platform columns holding the per-platform overrides, in field order. */
export const PLATFORM_PROVIDER_COLUMNS = {
  cover:       'providerCover',
  info:        'providerInfo',
  description: 'providerDescription',
  screenshots: 'providerScreenshots',
} as const

/** True if any field is sourced from LaunchBox. */
export const usesLaunchBox = (m: ProviderMatrix): boolean =>
  m.cover === 'launchbox' || m.info === 'launchbox' || m.description === 'launchbox' || m.screenshots === 'launchbox'

/** True if any field is sourced from RAWG. */
export const usesRawg = (m: ProviderMatrix): boolean =>
  m.cover === 'rawg' || m.info === 'rawg' || m.description === 'rawg' || m.screenshots === 'rawg'
