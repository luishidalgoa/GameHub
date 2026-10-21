/**
 * Keeps whole-table aggregates for a while instead of recomputing them on every
 * request (#92). A value is recomputed at most once per `ttlMs` by this process.
 * It is not a scheduled job: the first request after the window pays the cost.
 */
const store = new Map<string, { at: number; value: unknown }>()

export async function cachedAggregate<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = store.get(key)
  if (hit && now - hit.at < ttlMs) return hit.value as T
  const value = await compute()
  store.set(key, { at: now, value })
  return value
}
