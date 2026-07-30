/**
 * Minimal in-process rate limiter for the admin login.
 *
 * In-memory on purpose: a single container serves this app, and a limiter that
 * needs a table would just add failure modes. It resets on redeploy — that is a
 * real limitation, but it still turns an unlimited online password guess into a
 * few attempts per window.
 *
 * When the client IP is unknowable (no trusted proxy — see lib/net.ts) all
 * callers share one bucket. That is intentionally strict: better to slow down
 * every attempt than to let an attacker opt out of the limit by hiding.
 */

interface Bucket {
  hits:      number[]
  /** Set while the caller is locked out. */
  blockedAt: number | null
}

const buckets = new Map<string, Bucket>()

export interface RateLimitOptions {
  /** Attempts allowed inside the window. */
  limit:      number
  windowMs:   number
  /** How long a caller stays blocked after exceeding the limit. */
  blockMs:    number
}

export interface RateLimitResult {
  ok:         boolean
  remaining:  number
  /** Seconds until the caller may retry — only meaningful when `ok` is false. */
  retryAfter: number
}

/** Drop buckets nothing has touched for a while so the map can't grow forever. */
function sweep(now: number, windowMs: number, blockMs: number): void {
  if (buckets.size < 512) return
  const horizon = now - Math.max(windowMs, blockMs)
  for (const [key, bucket] of buckets) {
    const last = Math.max(bucket.blockedAt ?? 0, bucket.hits[bucket.hits.length - 1] ?? 0)
    if (last < horizon) buckets.delete(key)
  }
}

/** Record an attempt and report whether it is allowed. */
export function hitRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  sweep(now, opts.windowMs, opts.blockMs)

  const bucket = buckets.get(key) ?? { hits: [], blockedAt: null }
  buckets.set(key, bucket)

  if (bucket.blockedAt !== null) {
    const elapsed = now - bucket.blockedAt
    if (elapsed < opts.blockMs) {
      return { ok: false, remaining: 0, retryAfter: Math.ceil((opts.blockMs - elapsed) / 1000) }
    }
    bucket.blockedAt = null
    bucket.hits = []
  }

  bucket.hits = bucket.hits.filter((t) => now - t < opts.windowMs)
  bucket.hits.push(now)

  if (bucket.hits.length > opts.limit) {
    bucket.blockedAt = now
    return { ok: false, remaining: 0, retryAfter: Math.ceil(opts.blockMs / 1000) }
  }

  return { ok: true, remaining: opts.limit - bucket.hits.length, retryAfter: 0 }
}

/** Clear a caller's attempts — call after a successful login. */
export function resetRateLimit(key: string): void {
  buckets.delete(key)
}
