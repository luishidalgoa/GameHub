import { NextResponse } from 'next/server'
import { hitRateLimit } from '@/lib/rate-limit'
import { resolveClientIp } from '@/lib/net'

/** Creating queue entries: 30 requests per ten minutes per client (#118). */
const QUEUE_CREATE = { limit: 30, windowMs: 10 * 60_000, blockMs: 10 * 60_000 }

/** A 429 when this client has created too many queue entries recently, otherwise null. */
export function queueCreateGuard(headers: Headers): NextResponse | null {
  const ip = resolveClientIp(headers) ?? 'unknown'
  const result = hitRateLimit(`queue-create:${ip}`, QUEUE_CREATE)
  if (result.ok) return null
  return NextResponse.json(
    { error: 'Demasiadas descargas en cola en poco tiempo; espera un momento' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
  )
}
