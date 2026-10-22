import { db } from '@/lib/db'
import { runAutomatic } from '@/lib/automatic'
import { changedFields, lockFields, parseLocks, LOCKABLE_FIELDS } from '@/lib/manual-fields'
import { parseMetadataSources, type MetadataSources } from './sources'

/**
 * The one place a metadata write is decided (#85). Every path that changes a
 * game's metadata goes through here, so the lock rules and the provenance rules
 * live in one function and cannot drift apart.
 *
 *  - owner: the owner typed the values in the editor. A changed value that is
 *    not blank becomes the owner's (locked); a blank one is released, because a
 *    blank has nothing to protect. `unlock` releases fields on purpose.
 *  - pick: the owner chose one provider candidate from the search dialog. The
 *    fields are written as the provider's, not locked as the owner's text.
 *  - auto: a fill run by the system (button, batch, Wikidata, art). Locked
 *    fields are left alone; the database layer enforces it (db.ts, automatic.ts).
 */
export type WriteOrigin = 'owner' | 'pick' | 'auto'

export interface MetadataWrite {
  origin: WriteOrigin
  /** The columns to write, already normalised by the caller. */
  data: Record<string, unknown>
  /** Owner only: fields to release back to the automatic flows. */
  unlock?: readonly string[]
  /**
   * The provenance after this write. It replaces the stored one, so a label never
   * outlives the value it described. A cover the owner picked by hand is kept when
   * the write does not set a cover.
   */
  sources?: MetadataSources
}

const isBlank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

/** The provenance a write leaves: the new one, with a hand-picked cover kept. */
export function mergeSources(prevJson: string | null | undefined, next: MetadataSources): MetadataSources {
  const prev = parseMetadataSources(prevJson)
  const out: MetadataSources = { ...next }
  if (prev.coverManual && next.cover === undefined && next.coverManual === undefined) {
    out.cover = prev.cover
    out.coverManual = true
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
  if (write.sources) data.metadataSources = JSON.stringify(mergeSources(current.metadataSources as string | null, write.sources))

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
    // The fields the pick writes now hold a provider's value, not the owner's text:
    // their locks are released, so the badge shows the provider.
    const written = Object.keys(data).filter(k => (LOCKABLE_FIELDS as readonly string[]).includes(k))
    const kept = parseLocks(current.manualFields as string | null).filter(f => !written.includes(f))
    data.manualFields = kept.length ? JSON.stringify(kept) : null
    return db.game.update({ where: { id: gameId }, data })
  }

  // auto: locked fields are stripped inside the automatic context.
  return runAutomatic(() => db.game.update({ where: { id: gameId }, data }))
}
