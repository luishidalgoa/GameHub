import sharp from 'sharp'
import { db } from '@/lib/db'
import { uploadToS3 } from '@/lib/s3'
import { providerFetch } from '@/lib/metadata/http'
import { paletteOf } from '@/lib/palette'
import { BACKDROP_STYLES, TILE_TEMPLATES, type BackdropStyle, type TileTemplate } from '@/lib/publisher-style'

/**
 * Art for the publishers rail. Each tile is a custom gradient, an optional
 * character cut-out and the publisher's logo. The logo is found automatically in
 * Wikidata (its "logo image" property, hosted on Wikimedia Commons); the character
 * is uploaded by the owner, because no free source maps a publisher to a
 * cut-out of one of its characters. Kept in one Setting row: a few dozen entries,
 * no table for them.
 */
/**
 * Where an element sits in the tile, in percent of the tile's size: the centre (x, y), and a box
 * of width w and height h. A missing w or h follows the picture's own proportions. A box with
 * both is a crop: the picture covers it, as the character does on Home.
 */
export interface Place {
  x: number
  y: number
  w?: number
  h?: number
}

/** The owner's arrangement of the tile. An element without a place keeps the default arrangement. */
export interface PublisherLayout {
  character?: Place
  logo?: Place
}

export interface PublisherArt {
  /** Where the character and the logo sit, when the owner has arranged them. */
  layout?: PublisherLayout
  /** S3 key (with ?v=) of the logo, or null when none was found. */
  logo: string | null
  /** S3 key of an uploaded character cut-out, if any. */
  character: string | null
  /** Two "#rrggbb" colors for the tile's gradient. */
  colors: string[]
  /** The logo is a filled shape (a badge or a box), so it keeps its own colors instead of turning white. */
  plain?: boolean
  /** How the tile is laid out and painted. Absent: the default template and the brand's own motif. */
  style?: { template?: TileTemplate; backdrop?: BackdropStyle | 'auto' }
  /** When the logo was last looked for, so a miss is not searched again every run. */
  checkedAt: string | null
}

export type PublisherArtMap = Record<string, PublisherArt>

const KEY = 'publisher_art'
const WIKIDATA = 'https://www.wikidata.org/w/api.php'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function getPublisherArt(): Promise<PublisherArtMap> {
  try {
    const row = await db.setting.findUnique({ where: { key: KEY } })
    return row ? JSON.parse(row.value) as PublisherArtMap : {}
  } catch {
    return {}
  }
}

async function save(map: PublisherArtMap): Promise<void> {
  const value = JSON.stringify(map)
  await db.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } })
}

/** A layout as stored: known elements only, centres inside the tile, sizes between 4% and 200%. */
export function cleanLayout(input: unknown): PublisherLayout {
  const out: PublisherLayout = {}
  if (!input || typeof input !== 'object') return out
  const src = input as Record<string, unknown>
  const place = (v: unknown): Place | undefined => {
    if (!v || typeof v !== 'object') return undefined
    const p = v as Record<string, unknown>
    const num = (n: unknown, lo: number, hi: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null)
    const x = num(p.x, 0, 100), y = num(p.y, 0, 100)
    const w = p.w === undefined ? undefined : num(p.w, 4, 200) ?? undefined
    const h = p.h === undefined ? undefined : num(p.h, 4, 200) ?? undefined
    if (x === null || y === null || (w === undefined && h === undefined)) return undefined
    return { x, y, ...(w !== undefined && { w }), ...(h !== undefined && { h }) }
  }
  const character = place(src.character)
  const logo = place(src.logo)
  if (character) out.character = character
  if (logo) out.logo = logo
  return out
}

/** Read-modify-write of one publisher, so a concurrent edit of another is not lost. */
async function patch(key: string, change: Partial<PublisherArt>): Promise<PublisherArt> {
  const map = await getPublisherArt()
  const blank: PublisherArt = { logo: null, character: null, colors: [], checkedAt: null }
  const next: PublisherArt = { ...blank, ...map[key], ...change }
  map[key] = next
  await save(map)
  return next
}

/** Saves where the owner has put the character and the logo. */
export async function saveLayout(key: string, layout: unknown): Promise<PublisherArt> {
  return patch(key, { layout: cleanLayout(layout) })
}

/**
 * The art of a group: each field from the first of the group's keys that has it, so the
 * art saved under a company's old name keeps working after the company joins a group.
 */
export function artOf(keys: string[], map: PublisherArtMap): PublisherArt | null {
  const out: Record<string, unknown> = {}
  let found = false
  for (const k of keys) {
    const a = map[k]
    if (!a) continue
    found = true
    for (const [field, value] of Object.entries(a)) {
      if (value === null || value === undefined) continue
      if (Array.isArray(value) && value.length === 0) continue
      if (out[field] === undefined) out[field] = value
    }
  }
  if (!found) return null
  return { logo: null, character: null, colors: [], checkedAt: null, ...out } as PublisherArt
}

/** Keeps only the known template and backdrop; anything else is dropped. */
export function cleanStyle(input: unknown): NonNullable<PublisherArt['style']> {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const out: NonNullable<PublisherArt['style']> = {}
  if (TILE_TEMPLATES.includes(src.template as TileTemplate)) out.template = src.template as TileTemplate
  if (src.backdrop === 'auto' || BACKDROP_STYLES.includes(src.backdrop as BackdropStyle)) out.backdrop = src.backdrop as BackdropStyle | 'auto'
  return out
}

/** Saves whether the logo keeps its own colors (true) or is shown as a white silhouette (false). */
export async function savePlain(key: string, plain: boolean): Promise<PublisherArt> {
  return patch(key, { plain })
}

/** Saves the tile's template and backdrop. */
export async function saveStyle(key: string, style: unknown): Promise<PublisherArt> {
  return patch(key, { style: cleanStyle(style) })
}

// ── Colors ────────────────────────────────────────────────────────────────────

/**
 * Each brand's own colors, by publisher key. A logo's pixels do not always show
 * the brand (Nintendo's red box is knocked out to transparency before the palette
 * is taken), so the owner's color wins over the one measured from the logo.
 */
export const BRAND_COLORS: Record<string, [string, string]> = {
  nintendo:       ['#c8102e', '#5a0812'],
  sony:           ['#2b2f38', '#0b0d12'],
  sega:           ['#0a6cc4', '#06305c'],
  capcom:         ['#d9482b', '#4a120a'],
  konami:         ['#3a3d33', '#14150f'],
  activision:     ['#e08a1e', '#5a3206'],
  ubisoft:        ['#3f9a3a', '#143d12'],
  ea:             ['#c9a227', '#4a3a0a'],
  'square enix':  ['#4b2a9a', '#170b3d'],
  thq:            ['#4a4f5c', '#15171d'],
  atari:          ['#d12a1f', '#2a0a08'],
  'disney':       ['#1a4fa0', '#0b2355'],
  majesco:        ['#6a1b9a', '#2a0a3d'],
}

export { BRAND_STYLE, type BackdropStyle } from './publisher-style'

/** The brand's colors when the owner set them, else the ones measured for the publisher. */
export function brandColorsFor(key: string, measured: string[]): string[] {
  return BRAND_COLORS[key] ? [...BRAND_COLORS[key]] : measured
}

/** A stable hue from a name, for publishers whose logo has no color of its own. */
export function hueFromName(name: string): number {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h % 360
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** Saturation of a "#rrggbb" color, 0-1. */
function saturation(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255
  const max = Math.max(r, g, b)
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max
}

/**
 * Two gradient colors for a tile: the logo's own brand color when it has one,
 * else a hue taken from the name. Always a rich mid-tone pair, never gray.
 */
export function tileColors(logoPalette: string[], name: string): string[] {
  const brand = logoPalette.find(c => saturation(c) > 0.35)
  if (brand) {
    const n = parseInt(brand.slice(1), 16)
    // Pull it to a deep, saturated tone and pair it with a shifted neighbour.
    const r = n >> 16, g = (n >> 8) & 255, b = n & 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let h = 0
    if (max !== min) {
      const d = max - min
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      h = (h * 60 + 360) % 360
    }
    return [hslToHex(h, 0.7, 0.32), hslToHex((h + 28) % 360, 0.65, 0.14)]
  }
  const h = hueFromName(name)
  return [hslToHex(h, 0.6, 0.32), hslToHex((h + 40) % 360, 0.6, 0.14)]
}

// ── Logo lookup ───────────────────────────────────────────────────────────────

const COMPANY_WORDS = /\b(company|publisher|developer|studio|corporation|manufacturer)\b/i

async function wikidata<T>(params: Record<string, string>): Promise<T | null> {
  const url = `${WIKIDATA}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`
  const res = await providerFetch(url)
  return res.ok ? await res.json() as T : null
}

/** The Commons file name of a company's logo, from Wikidata's "logo image" (P154). */
export async function findLogoFile(name: string): Promise<string | null> {
  const found = await wikidata<{ search: { id: string; label?: string; description?: string }[] }>({
    action: 'wbsearchentities', search: name, language: 'en', type: 'item', limit: '6',
  })
  const candidates = (found?.search ?? []).filter(c => COMPANY_WORDS.test(c.description ?? ''))
  if (candidates.length === 0) return null
  const entities = await wikidata<{ entities: Record<string, { claims?: { P154?: { mainsnak?: { datavalue?: { value?: string } } }[] } }> }>({
    action: 'wbgetentities', ids: candidates.map(c => c.id).join('|'), props: 'claims',
  })
  for (const c of candidates) {
    const file = entities?.entities?.[c.id]?.claims?.P154?.[0]?.mainsnak?.datavalue?.value
    if (file) return file
  }
  return null
}

/** The logo as a PNG with transparency, cropped to its content, and whether it is a filled shape. */
async function downloadLogo(file: string): Promise<{ png: Buffer; plain: boolean } | null> {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=800`
  const res = await providerFetch(url, { redirect: 'follow' })
  if (!res.ok) return null
  const raw = Buffer.from(await res.arrayBuffer())
  return normalizeLogo(raw)
}

/**
 * A logo drawn on a solid rectangle (Nintendo's red box) has no transparency, so
 * as a silhouette it would be a white block. Its background is the commonest
 * color; every pixel becomes transparent in proportion to how close it is to that
 * color, which leaves just the lettering and outline.
 */
export function knockOutBackground(rgb: Uint8Array, channels: number): Uint8Array {
  const n = Math.floor(rgb.length / channels)
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < n; i++) {
    const o = i * channels
    const q = ((rgb[o] >> 4) << 8) | ((rgb[o + 1] >> 4) << 4) | (rgb[o + 2] >> 4)
    const e = buckets.get(q) ?? { n: 0, r: 0, g: 0, b: 0 }
    e.n++; e.r += rgb[o]; e.g += rgb[o + 1]; e.b += rgb[o + 2]
    buckets.set(q, e)
  }
  // The background is the commonest color, taken at its true average.
  const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0] ?? { n: 1, r: 0, g: 0, b: 0 }
  const bg = [top.r / top.n, top.g / top.n, top.b / top.n]
  const dist = (r: number, g: number, b: number) => Math.hypot(r - bg[0], g - bg[1], b - bg[2])
  // The foreground is the pixel farthest from the background, so a mix of the two
  // reads as a fraction of the way between them.
  let far = 1
  for (let i = 0; i < n; i++) far = Math.max(far, dist(rgb[i * channels], rgb[i * channels + 1], rgb[i * channels + 2]))
  const out = new Uint8Array(n * 4)
  for (let i = 0; i < n; i++) {
    const o = i * channels
    const alpha = Math.min(1, dist(rgb[o], rgb[o + 1], rgb[o + 2]) / far)
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 255
    out[i * 4 + 3] = Math.round(alpha * 255)
  }
  return out
}

/** Crop a logo to its content, size it, and tell whether it is a filled shape. */
async function normalizeLogo(raw: Buffer): Promise<{ png: Buffer; plain: boolean }> {
  const meta = await sharp(raw).metadata()
  if (!meta.hasAlpha) {
    const { data, info } = await sharp(raw).raw().toBuffer({ resolveWithObject: true })
    const rgba = knockOutBackground(data, info.channels)
    raw = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
  }
  const png = await sharp(raw).trim().resize({ width: 700, height: 300, fit: 'inside' }).png().toBuffer()
  // A logo that fills most of its box (a red badge with white letters) would be a
  // solid white block as a silhouette, so it is shown in its own colors.
  const { channels } = await sharp(png).ensureAlpha().stats()
  // A fully opaque image has no alpha channel in the stats at all.
  const opaque = channels[3] ? channels[3].mean / 255 : 1
  return { png, plain: opaque > 0.6 }
}

/**
 * Look up and store the logos of the given publishers that have not been
 * checked yet. Paced for Wikimedia; one publisher failing does not stop the rest.
 */
export async function ensurePublisherLogos(
  publishers: { key: string; name: string; keys?: string[] }[],
  opts: { force?: boolean; signal?: AbortSignal } = {},
): Promise<{ found: number; missing: number }> {
  const map = await getPublisherArt()
  let found = 0, missing = 0
  for (const p of publishers) {
    if (opts.signal?.aborted) break
    if (!opts.force && artOf(p.keys ?? [p.key], map)?.checkedAt) continue
    try {
      const file = await findLogoFile(p.name)
      await sleep(400)
      const logo = file ? await downloadLogo(file) : null
      if (logo) {
        await storeLogo(p.key, p.name, logo.png, logo.plain)
        found++
      } else {
        await patch(p.key, { logo: null, colors: tileColors([], p.name), checkedAt: new Date().toISOString() })
        missing++
      }
    } catch {
      // Left unchecked: the next run tries it again.
    }
    await sleep(600)
  }
  return { found, missing }
}

async function storeLogo(key: string, name: string, png: Buffer, plain: boolean): Promise<PublisherArt> {
  const webp = await sharp(png).webp({ quality: 90, alphaQuality: 95 }).toBuffer()
  const s3Key = `art/publishers/${key.replace(/[^a-z0-9]+/g, '-')}-logo.webp`
  await uploadToS3(webp, s3Key)
  return patch(key, {
    logo: `${s3Key}?v=${Date.now()}`,
    colors: tileColors(await paletteOf(png), name),
    plain,
    checkedAt: new Date().toISOString(),
  })
}

/** Replace a publisher's logo with one the owner uploaded (when the automatic one is wrong or hard to read). */
export async function saveLogo(key: string, name: string, image: Buffer): Promise<PublisherArt> {
  const { png, plain } = await normalizeLogo(image)
  return storeLogo(key, name, png, plain)
}

/** Store an uploaded character cut-out (any image with transparency) for a publisher. */
export async function saveCharacter(key: string, image: Buffer): Promise<PublisherArt> {
  const webp = await sharp(image).trim().resize({ height: 900, width: 900, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 95 }).toBuffer()
  const s3Key = `art/publishers/${key.replace(/[^a-z0-9]+/g, '-')}-character.webp`
  await uploadToS3(webp, s3Key)
  return patch(key, { character: `${s3Key}?v=${Date.now()}` })
}

export async function clearCharacter(key: string): Promise<PublisherArt> {
  return patch(key, { character: null })
}
