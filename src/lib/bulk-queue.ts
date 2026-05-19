/**
 * In-memory token store for bulk (platform-extras) downloads.
 *
 * Bulk ZIPs are admin-only and ephemeral — no need to persist them in the DB.
 * Tokens expire after 15 min (same window as regular download tokens).
 */

export type BulkType = 'dlc' | 'update' | 'mod'

export interface BulkToken {
  token:        string
  platformSlug: string
  type:         BulkType
  createdAt:    number
  expiresAt:    number
}

const TTL_MS = 15 * 60_000

const store = new Map<string, BulkToken>()

function generateToken(): string {
  return 'bulk_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function pruneExpired() {
  const now = Date.now()
  for (const [token, entry] of store.entries()) {
    if (entry.expiresAt < now) store.delete(token)
  }
}

export function createBulkToken(platformSlug: string, type: BulkType): BulkToken {
  pruneExpired()
  const now   = Date.now()
  const entry: BulkToken = {
    token: generateToken(),
    platformSlug,
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
