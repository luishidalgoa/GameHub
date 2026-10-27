import { db } from '@/lib/db'
import {
  CHAIN_FIELDS, overrideOf, parseGlobal, resolveChains,
  type ChainField, type CoverSource, type DescriptionSource, type InfoSource, type ProviderChains, type ScreenshotSource,
} from './chains'

// Per-field metadata sources. Each kind of data has a chain of sources: the first one
// that answers wins, and the rest are the fallbacks (see chains.ts). The chains are the
// global default, and each platform can set its own (Platform.providerChains).
//
// The primary of each chain is also exposed as a single value: the batch's "wrong
// provider" sweep compares a game's stored source with it.

export type CoverProvider = CoverSource | 'none'
export type InfoProvider = InfoSource | 'none'
export type DescProvider = DescriptionSource | 'none'
export type ShotProvider = ScreenshotSource | 'none'

export interface ProviderMatrix {
  cover: CoverProvider
  info: InfoProvider
  description: DescProvider
  screenshots: ShotProvider
  /** The chains the primaries above start. The engine walks them in order. */
  chains: ProviderChains
}

const CHAIN_KEY = 'provider_chains'
const LEGACY_KEYS: Record<ChainField, string> = {
  cover:       'provider_cover',
  info:        'provider_info',
  description: 'provider_description',
  screenshots: 'provider_screenshots',
}

/** The matrix in force for a platform. Without a slug, the global one. */
export async function getProviderMatrix(platformSlug?: string): Promise<ProviderMatrix> {
  const [rows, platform] = await Promise.all([
    db.setting.findMany({ where: { key: { in: [CHAIN_KEY, ...Object.values(LEGACY_KEYS)] } } }),
    platformSlug
      ? db.platform.findUnique({
          where:  { slug: platformSlug },
          select: {
            providerChains: true,
            providerCover: true, providerInfo: true,
            providerDescription: true, providerScreenshots: true,
          },
        })
      : Promise.resolve(null),
  ])

  const setting = (key: string) => rows.find(r => r.key === key)?.value || undefined
  const legacy = (field: ChainField) => setting(LEGACY_KEYS[field])
  const global = parseGlobal(setting(CHAIN_KEY), {
    cover: legacy('cover'), info: legacy('info'), description: legacy('description'), screenshots: legacy('screenshots'),
  })

  const slug = platformSlug ?? 'global'
  const override = platform
    ? overrideOf(slug, platform.providerChains, {
        cover: platform.providerCover, info: platform.providerInfo,
        description: platform.providerDescription, screenshots: platform.providerScreenshots,
      })
    : null
  const chains = resolveChains(global, override, slug)

  return {
    cover:       chains.cover[0] ?? 'none',
    info:        chains.info[0] ?? 'none',
    description: chains.description[0] ?? 'none',
    screenshots: chains.screenshots[0] ?? 'none',
    chains,
  }
}
