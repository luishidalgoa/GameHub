/**
 * In-memory token store for bulk (game-extras) downloads.
 *
 * Bulk ZIPs are ephemeral — no need to persist in the DB.
 * Tokens expire after 15 min (same as regular download tokens).
 */

export type BulkType = 'dlc' | 'update' | 'mod'

export interface BulkToken {
  token:     string
  gameId:    number
  type:      BulkType
  createdAt: number
  expiresAt: number
}

const TTL_MS = 15 * 60_000

// Survive Next.js HMR module reloads in dev by pinning the store to globalThis
const g = globalThis as typeof globalThis & { _bulkTokenStore?: Map<string, BulkToken> }
if (!g._bulkTokenStore) g._bulkTokenStore = new Map()
const store = g._bulkTokenStore

function generateToken(): string {
  return 'bulk_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function pruneExpired() {
  const now = Date.now()
  for (const [token, entry] of store.entries()) {
    if (entry.expiresAt < now) store.delete(token)
  }
}

export function createBulkToken(gameId: number, type: BulkType): BulkToken {
  pruneExpired()
  const now = Date.now()
  const entry: BulkToken = {
    token: generateToken(),
    gameId,
    type,
    createdAt: now,
    expiresAt: now + TTL_MS,
  }
  store.set(entry.token, entry)
  return entry
}

export function getBulkToken(token: string): BulkToken | null {
  pruneExpired()
  const entry = store.get(token)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) { store.delete(token); return null }
  return entry
}

export function consumeBulkToken(token: string): BulkToken | null {
  const entry = getBulkToken(token)
  if (entry) store.delete(token)
  return entry
}

export function isBulkToken(token: string): boolean {
  return token.startsWith('bulk_')
}
