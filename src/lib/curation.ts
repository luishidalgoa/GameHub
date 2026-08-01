/**
 * Filename curation — proposes better ROM file names from the metadata we
 * already hold, WITHOUT ever renaming anything itself.
 *
 * Why this exists: the file name is the only copy of a game's identity that
 * survives losing the database. Curating it makes the library self-describing.
 *
 * Why it only *proposes*: the year comes from metadata, and metadata is
 * sometimes wrong. A file called `Kirby - Mouse Attack (2011)` was produced by
 * trusting a mismatched RAWG entry — the game is from 2006. A wrong DB field is
 * one UPDATE away from being fixed; a wrong file name has already been written
 * to disk. So every proposal is reviewed by a human, and the risky ones arrive
 * pre-rejected.
 *
 * The rename itself happens outside the app: the container mounts the library
 * read-only on purpose, so an approved plan is handed to a host-side applier.
 */

/** Why a proposal deserves a second look before being accepted. */
export type RiskKind =
  /** Its RAWG entry is shared with another game — the pattern that produced
   *  the wrong Kirby year. Either it is a legitimate multi-platform release, or
   *  one of the two is mismatched and its year cannot be trusted. */
  | 'shared-card'
  /** No catalogue entry backs the year at all, so nothing corroborates it. */
  | 'no-source'

export interface CurationCandidate {
  id: number
  fileName: string
  filePath: string
  releaseYear: number | null
  rawgId: number | null
  platformName: string
}

export interface RenameProposal {
  id: number
  platform: string
  filePath: string
  currentName: string
  proposedName: string
  /** Where the added text starts in `proposedName`, so the UI can highlight
   *  exactly what changed instead of making the reader diff two long strings. */
  insertAt: number
  insertedText: string
  year: number
  risk: RiskKind | null
}

/** A year already present as "(1999)" or "[1999]" — nothing to add. */
const HAS_YEAR = /[([](19|20)\d{2}[)\]]/
/** First No-Intro style tag; the year goes just before it. */
const FIRST_TAG = /[([]/

const MIN_YEAR = 1970
const MAX_YEAR = new Date().getFullYear() + 1

/**
 * Insert " (year)" before the first tag group, or at the end of the stem when
 * the name carries no tags.
 *
 *   "Deadly Skies (E).gba"  →  "Deadly Skies (2002) (E).gba"
 *   "Super Metroid.sfc"     →  "Super Metroid (1994).sfc"
 *
 * Returns null when the name already carries a year, or when nothing would
 * change.
 */
export function insertYear(
  fileName: string,
  year: number,
): { proposedName: string; insertAt: number; insertedText: string } | null {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return null
  if (HAS_YEAR.test(fileName)) return null

  const extMatch = fileName.match(/\.[^.\\/]+$/)
  const ext = extMatch ? extMatch[0] : ''
  const stem = ext ? fileName.slice(0, -ext.length) : fileName
  if (!stem.trim()) return null

  const tag = stem.match(FIRST_TAG)
  const insertedText = `(${year})`

  let proposedStem: string
  let insertAt: number
  if (tag && tag.index !== undefined && tag.index > 0) {
    const head = stem.slice(0, tag.index).replace(/\s+$/, '')
    proposedStem = `${head} ${insertedText} ${stem.slice(tag.index)}`
    insertAt = head.length + 1
  } else {
    const head = stem.replace(/\s+$/, '')
    proposedStem = `${head} ${insertedText}`
    insertAt = head.length + 1
  }

  const proposedName = `${proposedStem.replace(/\s{2,}/g, ' ')}${ext}`
  if (proposedName === fileName) return null
  return { proposedName, insertAt, insertedText }
}

/**
 * Turn a candidate into a proposal, or null when there is nothing to propose.
 * `sharedRawgIds` holds the RAWG ids that more than one game points at.
 */
export function buildProposal(
  c: CurationCandidate,
  sharedRawgIds: ReadonlySet<number>,
): RenameProposal | null {
  if (c.releaseYear == null) return null
  const ins = insertYear(c.fileName, c.releaseYear)
  if (!ins) return null

  const risk: RiskKind | null =
    c.rawgId == null ? 'no-source'
    : sharedRawgIds.has(c.rawgId) ? 'shared-card'
    : null

  return {
    id: c.id,
    platform: c.platformName,
    filePath: c.filePath,
    currentName: c.fileName,
    proposedName: ins.proposedName,
    insertAt: ins.insertAt,
    insertedText: ins.insertedText,
    year: c.releaseYear,
    risk,
  }
}

/**
 * Guard for a name the user may have typed by hand. Deliberately strict: this
 * is the last check before a path reaches something that renames files.
 * The host-side applier repeats every one of these — it never trusts the app.
 */
export function validateProposedName(currentName: string, proposed: string): string | null {
  const name = proposed.trim()
  if (!name) return 'empty'
  if (name.length > 255) return 'too-long'
  if (name.includes('/') || name.includes('\\')) return 'has-separator'
  if (name === '.' || name === '..' || name.startsWith('..')) return 'traversal'
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(name)) return 'control-chars'

  const ext = (s: string) => (s.match(/\.[^.\\/]+$/) ?? [''])[0].toLowerCase()
  if (ext(name) !== ext(currentName)) return 'extension-changed'

  return null
}
