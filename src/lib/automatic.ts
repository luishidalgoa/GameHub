import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Marks the work done without the owner's hand (the metadata batch, the image
 * re-extraction, the Wikidata fallback, the auto-metadata after a scan). Inside it,
 * the database layer drops every write to a field the owner has locked.
 */
const automatic = new AsyncLocalStorage<true>()

export function runAutomatic<T>(fn: () => PromiseLike<T>): Promise<T> {
  // Awaited inside the context: Prisma runs a query when it is awaited, so the await
  // must happen where the marker is set.
  return automatic.run(true, async () => await fn())
}

export function inAutomatic(): boolean {
  return automatic.getStore() === true
}
