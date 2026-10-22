/**
 * Fields the owner set by hand. A value that came from the owner's own hand (the
 * editor, a manual cover or art upload, a provider the owner picked in the editor)
 * is worth more than anything an automatic flow finds, so automatic flows cannot
 * overwrite it. Only the owner can change it again, from the editor.
 */

/** The metadata fields the owner can set in the editor and the automatic flows write. */
export const LOCKABLE_FIELDS = [
  'title', 'sortTitle', 'description', 'releaseYear', 'developer', 'publisher', 'genre',
  'rawgScore', 'trailerUrl', 'coverPath', 'coverUrl', 'screenshotPaths',
  'backdropPath', 'backdropKind', 'tilePath', 'logoPath', 'themePalette',
] as const

/** The locks stored on a game, as a list of field names. */
export function parseLocks(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** The stored locks with more fields added, as the JSON to save. */
export function lockFields(raw: string | null | undefined, fields: readonly string[]): string {
  return JSON.stringify([...new Set([...parseLocks(raw), ...fields])].sort())
}

/** The fields whose value the owner just changed: compared to what was stored. */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  candidates: readonly string[] = LOCKABLE_FIELDS,
): string[] {
  const norm = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  return candidates.filter(k => k in after && norm(before[k]) !== norm(after[k]))
}

/** The write without the fields the owner has locked. */
export function stripLocked<T extends Record<string, unknown>>(data: T, locks: readonly string[]): Partial<T> {
  const out: Partial<T> = {}
  for (const [k, v] of Object.entries(data)) {
    if (!locks.includes(k)) (out as Record<string, unknown>)[k] = v
  }
  return out
}
