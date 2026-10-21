import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient; sqliteTuned?: boolean }

// SQLite requires connection_limit=1 — multiple concurrent writers cause P1008 timeouts.
// We append it here at runtime so it works regardless of what DATABASE_URL looks like.
function buildDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? ''
  if (url.includes('connection_limit')) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}connection_limit=1`
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ datasources: { db: { url: buildDatabaseUrl() } } })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// WAL lets readers (the web, the backup) run while the one writer writes, and
// busy_timeout makes a write wait for the lock instead of failing at once. Both
// are per connection, and connection_limit=1 keeps the client on a single one.
if (!globalForPrisma.sqliteTuned) {
  globalForPrisma.sqliteTuned = true
  db.$queryRawUnsafe('PRAGMA busy_timeout = 5000')
    .then(() => db.$queryRawUnsafe('PRAGMA journal_mode = WAL'))
    .catch(err => console.error('[db] sqlite pragmas failed:', err))
}
