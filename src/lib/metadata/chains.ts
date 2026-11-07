// The order in which each kind of data is asked of its sources, per platform. The first
// source of a chain is the primary; the rest are the fallbacks, in the order they are
// tried. An empty chain means "no source": nothing is asked for that kind of data.
//
// Pure: the settings UI and the engine both read it, so it is free of server imports.

export const COVER_SOURCES = ['launchbox', 'libretro', 'steamgriddb', 'nintendo'] as const
export type CoverSource = typeof COVER_SOURCES[number]

export const INFO_SOURCES = ['launchbox', 'rawg', 'steam'] as const
export type InfoSource = typeof INFO_SOURCES[number]

export const DESCRIPTION_SOURCES = ['rawg', 'launchbox', 'steam'] as const
export type DescriptionSource = typeof DESCRIPTION_SOURCES[number]

export const SCREENSHOT_SOURCES = ['launchbox', 'rawg', 'steam'] as const
export type ScreenshotSource = typeof SCREENSHOT_SOURCES[number]

/** Banner (wide image) and logo: LaunchBox's copies or SteamGridDB's, in the order the chain says. */
export const ART_SOURCES = ['launchbox', 'steamgriddb'] as const
export type ArtSource = typeof ART_SOURCES[number]

/** Fondo de las tarjetas (16:9): LaunchBox, SteamGridDB (heroes) o la ficha de Steam. */
export const FANART_SOURCES = ['launchbox', 'steamgriddb', 'steam'] as const
export type FanartSource = typeof FANART_SOURCES[number]

export interface ProviderChains {
  cover: CoverSource[]
  info: InfoSource[]
  description: DescriptionSource[]
  screenshots: ScreenshotSource[]
  banner: ArtSource[]
  logo: ArtSource[]
  fanart: FanartSource[]
}

export type ChainField = keyof ProviderChains

/**
 * A cover must be at least this many times the platform's box, on each side, to count as good
 * quality. Twice the box is the size a sharp card needs on a high-density screen.
 */
export const COVER_MIN_SCALE = 2
export const CHAIN_FIELDS: readonly ChainField[] = ['cover', 'info', 'description', 'screenshots', 'banner', 'logo', 'fanart']

/** What each field's chain can hold, for a platform. Only Switch has the Nintendo store's covers. */
export function optionsFor(field: ChainField, slug: string): readonly string[] {
  switch (field) {
    case 'cover':       return slug === 'switch' ? COVER_SOURCES : COVER_SOURCES.filter(s => s !== 'nintendo')
    case 'info':        return INFO_SOURCES
    case 'description': return DESCRIPTION_SOURCES
    case 'screenshots': return SCREENSHOT_SOURCES
    case 'banner':      return ART_SOURCES
    case 'logo':        return ART_SOURCES
    case 'fanart':      return FANART_SOURCES
  }
}

/** The chains in force when nothing is set: the way GameHub has always asked. */
export const DEFAULT_CHAINS: ProviderChains = {
  cover:       ['launchbox', 'libretro', 'steamgriddb'],
  info:        ['launchbox', 'rawg'],
  description: ['rawg', 'launchbox'],
  screenshots: ['launchbox'],
  banner:      ['launchbox', 'steamgriddb'],
  logo:        ['launchbox', 'steamgriddb'],
  fanart:      ['launchbox', 'steamgriddb'],
}

/**
 * Built-in chains of single platforms, used when the platform has no chain of its own.
 * Switch has no libretro box: its covers come from LaunchBox, then SteamGridDB, and
 * only then the Nintendo store.
 */
export const PLATFORM_DEFAULTS: Record<string, Partial<ProviderChains>> = {
  switch: { cover: ['launchbox', 'steamgriddb', 'nintendo'] },
}

/** Keeps the valid, unique options of a chain. Null when the value is not a list at all. */
export function sanitizeChain<F extends ChainField>(field: F, value: unknown, slug: string): ProviderChains[F] | null {
  if (!Array.isArray(value)) return null
  const allowed = optionsFor(field, slug) as readonly string[]
  const kept = [...new Set(value.filter((v): v is string => typeof v === 'string' && allowed.includes(v)))]
  // A list that held only sources this scope cannot use is not a choice: it is as if it were not set.
  if (value.length > 0 && kept.length === 0) return null
  return kept as ProviderChains[F]
}

/** A platform's own chains, from its stored JSON. Null when it has none. */
export function parseOverride(raw: string | null | undefined, slug: string): Partial<ProviderChains> | null {
  if (!raw) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return null }
  if (!parsed || typeof parsed !== 'object') return null
  const out: Partial<ProviderChains> = {}
  for (const field of CHAIN_FIELDS) {
    const chain = sanitizeChain(field, (parsed as Record<string, unknown>)[field], slug)
    if (chain) (out as Record<string, unknown>)[field] = chain
  }
  return Object.keys(out).length > 0 ? out : null
}

/** The global chains, from the stored JSON. Without it, the older single-source settings still count. */
export function parseGlobal(raw: string | null | undefined, legacy: Partial<Record<ChainField, string | undefined>>): ProviderChains {
  const fromJson = (() => {
    if (!raw) return null
    try { return JSON.parse(raw) as Record<string, unknown> } catch { return null }
  })()
  const out = { ...DEFAULT_CHAINS }
  for (const field of CHAIN_FIELDS) {
    const chain = sanitizeChain(field, fromJson?.[field], 'global') ?? legacyChain(field, legacy[field])
    if (chain) (out as Record<string, unknown>)[field] = chain
  }
  return out
}

/**
 * The chain a single old setting (one primary source per field) stands for. The
 * fallbacks are what the code always did: the other sources, in the usual order.
 */
export function legacyChain(field: ChainField, primary: string | undefined, slug?: string): ProviderChains[ChainField] | null {
  if (!primary) return null
  if (primary === 'none') return []
  const valid = optionsFor(field, 'global') as readonly string[]
  if (!valid.includes(primary)) return null
  // Screenshots fell back to LaunchBox's whenever the primary had none; the other kinds fell back to the rest.
  if (field === 'screenshots') {
    return (primary === 'launchbox' ? ['launchbox'] : [primary, 'launchbox']) as ProviderChains['screenshots']
  }
  // The fallbacks are the platform's own default when it has one (Switch keeps SteamGridDB and the store), else the usual ones.
  const base = (slug && PLATFORM_DEFAULTS[slug]?.[field]) ?? DEFAULT_CHAINS[field]
  const rest = (base as readonly string[]).filter(s => s !== primary)
  return [primary, ...rest] as ProviderChains[ChainField]
}

/**
 * The chains a platform asks in the end: its own override first, then its built-in
 * default, then the global chains. Every field is checked against what the platform
 * can use.
 */
export function resolveChains(global: ProviderChains, override: Partial<ProviderChains> | null, slug: string): ProviderChains {
  const builtin = PLATFORM_DEFAULTS[slug] ?? {}
  const pick = <F extends ChainField>(field: F): ProviderChains[F] =>
    (sanitizeChain(field, override?.[field], slug)
      ?? sanitizeChain(field, builtin[field], slug)
      ?? sanitizeChain(field, global[field], slug)
      ?? []) as ProviderChains[F]
  return {
    cover: pick('cover'), info: pick('info'), description: pick('description'), screenshots: pick('screenshots'),
    banner: pick('banner'), logo: pick('logo'), fanart: pick('fanart'),
  }
}

/** Where a platform's chain comes from, for the settings screen. */
export type ChainOrigin = 'platform' | 'builtin' | 'global'
export function originOf(field: ChainField, override: Partial<ProviderChains> | null, slug: string): ChainOrigin {
  if (override && override[field]) return 'platform'
  if (PLATFORM_DEFAULTS[slug]?.[field]) return 'builtin'
  return 'global'
}

/**
 * A platform's own chains: the chains saved for it, or else the old single-source columns
 * (one primary per field) converted the way legacyChain does. Null when it has none.
 */
export function overrideOf(
  slug: string,
  raw: string | null | undefined,
  legacyPrimary: Partial<Record<ChainField, string | null | undefined>>,
): Partial<ProviderChains> | null {
  const own = parseOverride(raw, slug)
  if (own) return own
  const out: Record<string, unknown> = {}
  for (const field of CHAIN_FIELDS) {
    const chain = legacyChain(field, legacyPrimary[field] ?? undefined, slug)
    if (chain) out[field] = chain
  }
  return Object.keys(out).length > 0 ? (out as Partial<ProviderChains>) : null
}

/** Everything the settings screen needs about the chains, from the global setting and one platform. */
export function snapshotFor(
  global: ProviderChains,
  platform: { slug: string; providerChains: string | null; providerCover: string | null; providerInfo: string | null; providerDescription: string | null; providerScreenshots: string | null },
): { override: Partial<ProviderChains> | null; effective: ProviderChains; origin: Record<ChainField, ChainOrigin> } {
  const override = overrideOf(platform.slug, platform.providerChains, {
    cover: platform.providerCover, info: platform.providerInfo,
    description: platform.providerDescription, screenshots: platform.providerScreenshots,
  })
  const effective = resolveChains(global, override, platform.slug)
  const origin = Object.fromEntries(CHAIN_FIELDS.map(f => [f, originOf(f, override, platform.slug)])) as Record<ChainField, ChainOrigin>
  return { override, effective, origin }
}
