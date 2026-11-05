// The admin's game actions as the browser calls them. The panel and the bulk bar both
// go through here, so an action means the same thing wherever it is started.

import type { GameActionName } from '@/lib/games/actions'

export type ClientGameAction = GameActionName | 'fillMetadata'

export interface ActionReply {
  ok: boolean
  /** Counts the server returned (listed, alreadyListed, updated, …). */
  counts: Record<string, number>
  error?: string
}

/** Runs a server strategy over one or many games. */
export async function runGameAction(action: GameActionName, ids: number[]): Promise<ActionReply> {
  const res = await fetch('/api/admin/games/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ids }),
  })
  const data = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) return { ok: false, counts: {}, error: typeof data.error === 'string' ? data.error : 'request_failed' }
  const counts: Record<string, number> = {}
  for (const [k, v] of Object.entries(data)) if (typeof v === 'number') counts[k] = v
  return { ok: true, counts }
}

export interface FillProgress { done: number; total: number }
export interface FillReply { filled: number; failed: number }

/**
 * Fills the metadata of each game in turn, through the same route as the panel's
 * button. One at a time: each one calls the providers, and a bulk run must not hammer them.
 */
export async function fillMetadataFor(ids: number[], onProgress?: (p: FillProgress) => void): Promise<FillReply> {
  let filled = 0
  let failed = 0
  for (let i = 0; i < ids.length; i++) {
    try {
      const res = await fetch(`/api/metadata/${ids[i]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (res.ok) filled++
      else failed++
    } catch {
      failed++
    }
    onProgress?.({ done: i + 1, total: ids.length })
  }
  return { filled, failed }
}
