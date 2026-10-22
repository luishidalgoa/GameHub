import { db } from '@/lib/db'
import { runAutomatic } from '@/lib/automatic'
import { changedFields, lockFields, parseLocks, LOCKABLE_FIELDS } from '@/lib/manual-fields'
import { parseMetadataSources, type FieldSource, type MetadataSources } from './sources'

/**
 * The one place a metadata write is decided (#85).
 *
 * A caller describes what it writes as a patch: each text field with its value and
 * the source that gave it. The patch carries its own provenance, so a label can
 * only be written together with the value it describes. Everything else (scores,
 * ids, paths, flags) goes in `data` and is written as given.
 *
 *  - owner: the owner typed the values in the editor. A changed value that is not
 *    blank becomes the owner's (locked); a blank one is released, because a blank
 *    has nothing to protect. Its provenance is the owner's, so no provider label
 *    is shown for it.
 *  - pick: the owner chose one provider candidate. The fields it writes are the
 *    provider's, not the owner's text: their locks are released.
 *  - auto: a fill run by the system. Locked fields are left alone (db.ts enforces
 *    it inside the automatic context).
 */
export type WriteOrigin = 'owner' | 'pick' | 'auto'

export const TEXT_FIELDS = ['title', 'description', 'releaseYear', 'genre', 'developer', 'publisher'] as const
export type TextField = typeof TEXT_FIELDS[number]

/** Who gave a value: the owner typed it, or a provider did. */
export type ValueSource = 'owner' | FieldSource

export type MetadataPatch = Partial<Record<TextField, { value: string | number | null; source: ValueSource }>>

export interface MetadataWrite {
  origin: WriteOrigin
  /** Text fields, each with its value and its source. */
  patch?: MetadataPatch
  /** Other columns (scores, ids, paths, flags), written as given. */
  data?: Record<string, unknown>
  /** Owner only: fields to release back to the automatic flows. */
  unlock?: readonly string[]
  /**
   * Cover and screenshot provenance, and the hand-picked flag. Only the keys
   * present are set; a key set to undefined is removed.
   */
  sources?: Partial<Pick<MetadataSources, 'cover' | 'screenshots' | 'coverManual'>>
}

/** The values of a patch, as plain columns. */
function pickValues(patch: MetadataPatch | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch ?? {}).map(([f, p]) => [f, p?.value]))
}

/**
 * Text values a provider run produced, as a patch: each field takes the source
 * `sourceOf` names for it. A field with no source is not written, because a value
 * without a source would carry no label.
 */
export function textPatch(
  values: Partial<Record<TextField, unknown>>,
  sourceOf: (field: TextField) => ValueSource | undefined,
): MetadataPatch {
  const patch: MetadataPatch = {}
  for (const f of TEXT_FIELDS) {
    const v = values[f]
    if (v === undefined) continue
    const source = sourceOf(f)
    if (source) patch[f] = { value: v as string | number | null, source }
  }
  return patch
}

const isBlank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

function setOrDelete<T extends object>(obj: T, key: keyof T, value: unknown) {
  if (value === undefined) delete obj[key]
  else (obj as Record<string, unknown>)[key as string] = value
}

/**
 * The provenance a write leaves. Text and fact labels follow the patch: a field
 * written from a provider takes that provider's label, a field left blank or set by
 * the owner loses its provider label. Cover and screenshot provenance follow `sources`.
 */
export function deriveSources(
  prevJson: string | null | undefined,
  patch: MetadataPatch | undefined,
  sources: MetadataWrite['sources'] = {},
): MetadataSources {
  const out: MetadataSources = { ...parseMetadataSources(prevJson) }
  const prev = parseMetadataSources(prevJson)

  for (const key of ['cover', 'screenshots', 'coverManual'] as const) {
    if (key in sources) setOrDelete(out, key, sources[key])
  }
  // A hand-picked cover survives a write that does not set a cover.
  if (prev.coverManual && !('cover' in sources) && !('coverManual' in sources)) {
    out.cover = prev.cover
    out.coverManual = true
  }

  if (patch) {
    const facts: Partial<Record<'developer' | 'publisher' | 'releaseYear' | 'genre', FieldSource>> = { ...(prev.facts ?? {}) }
    for (const field of TEXT_FIELDS) {
      const p = patch[field]
      if (!p) continue
      const fromProvider = p.source !== 'owner' && !isBlank(p.value)
      const label = fromProvider ? (p.source as FieldSource) : undefined
      if (field === 'title') setOrDelete(out, 'info', label)
      else if (field === 'description') setOrDelete(out, 'description', label)
      else if (field === 'releaseYear' || field === 'genre' || field === 'developer' || field === 'publisher') {
        setOrDelete(facts, field, label)
      }
    }
    setOrDelete(out, 'facts', Object.keys(facts).length ? facts : undefined)
  }
  return out
}

export async function applyMetadata(gameId: number, write: MetadataWrite) {
  const current = await db.game.findUnique({
    where: { id: gameId },
    select: { ...Object.fromEntries(LOCKABLE_FIELDS.map(k => [k, true])), manualFields: true, metadataSources: true } as never,
  }) as Record<string, unknown> | null
  if (!current) throw new Error(`applyMetadata: game ${gameId} not found`)

  const data: Record<string, unknown> = { ...write.data }
  const locks = parseLocks(current.manualFields as string | null)

  // What the patch really writes. An automatic fill cannot write a locked field, so
  // its label must not be written either: the label follows the value, never the intent.
  const patch: MetadataPatch | undefined = write.origin === 'owner'
    ? Object.fromEntries(
        changedFields(current, { ...data, ...pickValues(write.patch) }, LOCKABLE_FIELDS)
          .filter((f): f is TextField => (TEXT_FIELDS as readonly string[]).includes(f))
          .map(f => [f, { value: (write.patch?.[f as TextField]?.value ?? data[f]) as string | number | null, source: 'owner' as const }]),
      ) as MetadataPatch
    : write.origin === 'auto' && write.patch
      ? Object.fromEntries(Object.entries(write.patch).filter(([f]) => !locks.includes(f))) as MetadataPatch
      : write.patch

  for (const field of TEXT_FIELDS) {
    const p = patch?.[field]
    if (p) data[field] = p.value
  }

  if (patch || write.sources) {
    data.metadataSources = JSON.stringify(deriveSources(current.metadataSources as string | null, patch, write.sources))
  }

  if (write.origin === 'owner') {
    const changed = changedFields(current, data, LOCKABLE_FIELDS)
    const cleared = changed.filter(f => isBlank(data[f]))
    const set = changed.filter(f => !isBlank(data[f]))
    if (changed.length || write.unlock?.length) {
      const release = [...(write.unlock ?? []), ...cleared]
      const kept = parseLocks(current.manualFields as string | null).filter(f => !release.includes(f))
      data.manualFields = lockFields(JSON.stringify(kept), set)
    }
    return db.game.update({ where: { id: gameId }, data })
  }

  if (write.origin === 'pick') {
    // The fields the pick writes now hold a provider's value, not the owner's text.
    const written = Object.keys(data).filter(k => (LOCKABLE_FIELDS as readonly string[]).includes(k))
    const kept = parseLocks(current.manualFields as string | null).filter(f => !written.includes(f))
    data.manualFields = kept.length ? JSON.stringify(kept) : null
    return db.game.update({ where: { id: gameId }, data })
  }

  // auto: locked fields are stripped inside the automatic context.
  return runAutomatic(() => db.game.update({ where: { id: gameId }, data }))
}
