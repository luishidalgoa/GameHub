import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

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
