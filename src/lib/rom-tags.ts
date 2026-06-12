/**
 * ROM filename tag parser — extracts **region** and **languages** from a ROM
 * file name, following the common No-Intro / GoodTools / TOSEC conventions.
 *
 * A single file name can carry BOTH at once, e.g.:
 *   "Alvin and the Chipmunks (Europe) (En,Fr,De,Es,It).nds"
 *     → region: "EUR", regions: ["EUR"], languages: ["en","fr","de","es","it"]
 *
 * The goal is to capture as much as reliably possible. Disambiguation rule:
 *  - A parenthesised group whose comma-separated parts are ALL language tokens
 *    is treated as a language list  → "(En,Fr,De,Es,It)".
 *  - Otherwise each part is matched as a region (full name, GoodTools 1-letter
 *    code, or a known multi-region combo) → "(Europe)", "(USA, Europe)", "(JU)".
 *  - 1-letter tokens are GoodTools region codes ((U)/(E)/(J)…); 2-letter tokens
 *    are No-Intro language codes ((En)/(Es)…). They never collide.
 */

import { cleanTitle } from '@/lib/utils'

// ── Canonical region codes (kept compatible with the values already stored in
//    the DB: USA / EUR / JPN / World / ESP) ─────────────────────────────────────
const REGIONS: Record<string, string> = {
  // full names + ISO-ish + GoodTools 1-letter codes
  usa: 'USA', us: 'USA', u: 'USA', america: 'USA',
  europe: 'EUR', eur: 'EUR', e: 'EUR',
  japan: 'JPN', jpn: 'JPN', jap: 'JPN', j: 'JPN',
  world: 'World', w: 'World',
  spain: 'ESP', esp: 'ESP', s: 'ESP',
  france: 'FRA', fra: 'FRA', f: 'FRA',
  germany: 'DEU', ger: 'DEU', deu: 'DEU', g: 'DEU',
  italy: 'ITA', ita: 'ITA', i: 'ITA',
  netherlands: 'NLD', holland: 'NLD',
  sweden: 'SWE', swe: 'SWE',
  australia: 'AUS', aus: 'AUS', a: 'AUS',
  korea: 'KOR', kor: 'KOR', k: 'KOR',
  china: 'CHN', chn: 'CHN', c: 'CHN',
  taiwan: 'TWN', twn: 'TWN',
  brazil: 'BRA', bra: 'BRA', b: 'BRA',
  canada: 'CAN', can: 'CAN',
  uk: 'GBR', england: 'GBR', gbr: 'GBR', britain: 'GBR',
  asia: 'ASI',
  scandinavia: 'SCN',
  russia: 'RUS', rus: 'RUS', r: 'RUS',
  'hong kong': 'HKG', hongkong: 'HKG',
  portugal: 'POR', por: 'POR',
  mexico: 'MEX', mex: 'MEX',
  norway: 'NOR', nor: 'NOR',
  denmark: 'DEN', den: 'DEN',
  finland: 'FIN', fin: 'FIN',
  poland: 'POL', pol: 'POL',
  greece: 'GRC',
  india: 'IND',
  'latin america': 'LATAM', latin: 'LATAM',
  unknown: 'Unknown', unk: 'Unknown',
}

// GoodTools multi-region combo codes ((UE) = USA+Europe, (JU) = Japan+USA…).
const REGION_COMBOS: Record<string, string[]> = {
  ue: ['USA', 'EUR'], eu: ['USA', 'EUR'],
  ju: ['JPN', 'USA'], uj: ['JPN', 'USA'],
  je: ['JPN', 'EUR'], ej: ['JPN', 'EUR'],
  jue: ['JPN', 'USA', 'EUR'], jeu: ['JPN', 'USA', 'EUR'],
  uej: ['USA', 'EUR', 'JPN'], uje: ['USA', 'EUR', 'JPN'],
}

// ── Languages (No-Intro 2-letter codes → ISO-639-1 lowercase) ──────────────────
const LANGUAGE_CODES = new Set([
  'en', 'fr', 'de', 'es', 'it', 'ja', 'nl', 'pt', 'sv', 'no', 'da', 'fi',
  'ko', 'zh', 'ru', 'pl', 'cs', 'hu', 'el', 'tr', 'ar', 'he', 'ca', 'gd',
  'ga', 'eu', 'gl', 'sl', 'hr', 'sr', 'ro', 'bg', 'uk', 'et', 'lv', 'lt',
  'is', 'sk',
])

const LANGUAGE_NAMES: Record<string, string> = {
  english: 'en', french: 'fr', german: 'de', spanish: 'es', italian: 'it',
  japanese: 'ja', dutch: 'nl', portuguese: 'pt', swedish: 'sv', norwegian: 'no',
  danish: 'da', finnish: 'fi', korean: 'ko', chinese: 'zh', russian: 'ru',
  polish: 'pl', czech: 'cs', hungarian: 'hu', greek: 'el', turkish: 'tr',
  arabic: 'ar', hebrew: 'he', catalan: 'ca',
}

/** Normalise a single token to a language code, or null if it isn't one. */
function toLanguage(token: string): string | null {
  // Strip a region suffix like "Pt-BR" → "pt", and any stray punctuation.
  const t = token.trim().toLowerCase().split(/[-_/]/)[0].replace(/[^a-z]/g, '')
  if (!t) return null
  if (LANGUAGE_CODES.has(t)) return t
  return LANGUAGE_NAMES[t] ?? null
}

/** Match a single token to one or more canonical region codes. */
function toRegions(token: string): string[] {
  const t = token.trim().toLowerCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return []
  if (REGIONS[t]) return [REGIONS[t]]
  const compact = t.replace(/\s+/g, '')
  if (REGIONS[compact]) return [REGIONS[compact]]
  if (REGION_COMBOS[compact]) return [...REGION_COMBOS[compact]]
  return []
}

export interface RomTags {
  /** Primary region (first match) — for the single `region` column. */
  region: string | null
  /** All regions captured (deduped, in appearance order). */
  regions: string[]
  /** All languages captured as ISO-639-1 codes (deduped, in appearance order). */
  languages: string[]
}

/** Parse region + languages from a ROM file name. */
export function parseRomTags(fileName: string): RomTags {
  const regions: string[] = []
  const languages: string[] = []

  // Walk every "(...)" group (non-nested). Brackets "[...]" usually hold
  // dump/Title-ID info, not region/language, so we leave them out.
  const groups = fileName.match(/\(([^()]*)\)/g) ?? []
  for (const raw of groups) {
    const inner = raw.slice(1, -1).trim()
    if (!inner) continue
    const parts = inner.split(',').map(p => p.trim()).filter(Boolean)
    if (parts.length === 0) continue

    // Language list: every part is a language token.
    const langs = parts.map(toLanguage)
    if (langs.every(l => l !== null)) {
      for (const l of langs) if (l && !languages.includes(l)) languages.push(l)
      continue
    }

    // Otherwise interpret parts as regions.
    for (const p of parts) {
      for (const r of toRegions(p)) if (!regions.includes(r)) regions.push(r)
    }
  }

  return { region: regions[0] ?? null, regions, languages }
}

/**
 * Backwards-compatible single-region extractor (was in utils.ts). Kept so older
 * call sites and tests keep working; delegates to {@link parseRomTags}.
 */
export function extractRegion(fileName: string): string | null {
  return parseRomTags(fileName).region
}

/** Serialize a language list to the CSV stored in the DB ("es,en,it"). */
export function languagesToCsv(languages: string[]): string | null {
  return languages.length ? languages.join(',') : null
}

/** Parse the stored CSV back into an array. */
export function languagesFromCsv(csv: string | null | undefined): string[] {
  return csv ? csv.split(',').map(s => s.trim()).filter(Boolean) : []
}

/**
 * Stable grouping key for unifying region/revision/disc variants of the SAME
 * game into one card. The normalized title already drops everything inside
 * parentheses (region, languages, disc, revision) via {@link cleanTitle}, so
 * those collapse together. We DELIBERATELY keep demo/beta/proto builds apart by
 * appending a variant suffix, so a prototype never merges with the retail game.
 */
export function gameGroupKey(fileName: string): string {
  const base = cleanTitle(fileName).toLowerCase().replace(/[^a-z0-9]+/g, '')
  // Only inspect bracketed/parenthesised tags so a title word can't false-trip.
  const tags = (fileName.match(/[([][^)\]]*[)\]]/g) ?? []).join(' ').toLowerCase()
  const variants: string[] = []
  if (/\b(demo|sample|kiosk|preview|trial)\b/.test(tags)) variants.push('demo')
  if (/\b(beta|proto|prototype|alpha|debug)\b/.test(tags)) variants.push('proto')
  const suffix = variants.length ? ':' + variants.join('-') : ''
  return `name:${base}${suffix}`
}

// ── Display helpers (used by the region picker UI) ─────────────────────────────

const REGION_FLAGS: Record<string, string> = {
  USA: '🇺🇸', EUR: '🇪🇺', JPN: '🇯🇵', World: '🌐', ESP: '🇪🇸', FRA: '🇫🇷',
  DEU: '🇩🇪', ITA: '🇮🇹', NLD: '🇳🇱', SWE: '🇸🇪', AUS: '🇦🇺', KOR: '🇰🇷',
  CHN: '🇨🇳', TWN: '🇹🇼', BRA: '🇧🇷', CAN: '🇨🇦', GBR: '🇬🇧', ASI: '🌏',
  RUS: '🇷🇺', HKG: '🇭🇰', POR: '🇵🇹', MEX: '🇲🇽', NOR: '🇳🇴', DEN: '🇩🇰',
  FIN: '🇫🇮', POL: '🇵🇱', GRC: '🇬🇷', IND: '🇮🇳', SCN: '🌍', LATAM: '🌎',
}

/** Flag emoji for a region code (empty string if unknown). */
export function regionFlag(region: string | null | undefined): string {
  return region ? REGION_FLAGS[region] ?? '' : ''
}
