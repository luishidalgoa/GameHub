import sharp from 'sharp'
import { db } from '@/lib/db'
import { uploadToS3 } from '@/lib/s3'
import { providerFetch } from '@/lib/metadata/http'
import { paletteOf } from '@/lib/palette'

/**
 * Art for the publishers rail. Each tile is a custom gradient, an optional
 * character cut-out and the publisher's logo. The logo is found automatically in
 * Wikidata (its "logo image" property, hosted on Wikimedia Commons); the character
 * is uploaded by the owner, because no free source maps a publisher to a
 * cut-out of one of its characters. Kept in one Setting row: a few dozen entries,
 * no table for them.
 */
export interface PublisherArt {
  /** S3 key (with ?v=) of the logo, or null when none was found. */
  logo: string | null
  /** S3 key of an uploaded character cut-out, if any. */
  character: string | null
  /** Two "#rrggbb" colors for the tile's gradient. */
  colors: string[]
  /** The logo is a filled shape (a badge or a box), so it keeps its own colors instead of turning white. */
  plain?: boolean
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

/** Read-modify-write of one publisher, so a concurrent edit of another is not lost. */
async function patch(key: string, change: Partial<PublisherArt>): Promise<PublisherArt> {
  const map = await getPublisherArt()
  const blank: PublisherArt = { logo: null, character: null, colors: [], checkedAt: null }
  const next: PublisherArt = { ...blank, ...map[key], ...change }
  map[key] = next
  await save(map)
  return next
}

// ── Colors ────────────────────────────────────────────────────────────────────

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

/** Crop a logo to its content, size it, and tell whether it is a filled shape. */
async function normalizeLogo(raw: Buffer): Promise<{ png: Buffer; plain: boolean }> {
  const png = await sharp(raw).trim().resize({ width: 700, height: 300, fit: 'inside' }).png().toBuffer()
  // A logo that fills most of its box (a red badge with white letters) would be a
  // solid white block as a silhouette, so it is shown in its own colors.
  const { channels } = await sharp(png).ensureAlpha().stats()
  return { png, plain: channels[3].mean / 255 > 0.8 }
}

/**
 * Look up and store the logos of the given publishers that have not been
 * checked yet. Paced for Wikimedia; one publisher failing does not stop the rest.
 */
export async function ensurePublisherLogos(
  publishers: { key: string; name: string }[],
  opts: { force?: boolean; signal?: AbortSignal } = {},
): Promise<{ found: number; missing: number }> {
  const map = await getPublisherArt()
  let found = 0, missing = 0
  for (const p of publishers) {
    if (opts.signal?.aborted) break
    if (!opts.force && map[p.key]?.checkedAt) continue
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
