import { NextResponse } from 'next/server'
import { hitRateLimit } from '@/lib/rate-limit'
import { resolveClientIp } from '@/lib/net'

/** 60 calls per ten minutes per client, for routes that spend a third-party quota. */
const QUOTA = { limit: 60, windowMs: 10 * 60_000, blockMs: 10 * 60_000 }

/**
 * Returns a 429 when this client has used up its share of a route that calls a
 * paid or rate-limited provider (#101), otherwise null. Without a trusted proxy
 * the client IP is unknown and every such caller shares one bucket: strict on
 * purpose, the same rule the login limiter follows.
 */
export function quotaGuard(headers: Headers, scope: string): NextResponse | null {
  const ip = resolveClientIp(headers) ?? 'unknown'
  const result = hitRateLimit(`quota:${scope}:${ip}`, QUOTA)
  if (result.ok) return null
  return NextResponse.json(
    { error: 'Demasiadas peticiones; espera un momento' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
  )
}
