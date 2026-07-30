import { NextResponse } from 'next/server'
import { createSessionToken, safeEqual, sessionCookieOptions } from '@/lib/auth'
import { resolveClientIp } from '@/lib/net'
import { hitRateLimit, resetRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// This route is reachable from anywhere (the login page has no IP gate), so it is
// the one place an online password guess can be mounted. 10 tries per 15 min,
// then a 15 min lockout.
const LIMIT = { limit: 10, windowMs: 15 * 60_000, blockMs: 15 * 60_000 }

export async function POST(req: Request) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD not configured' }, { status: 500 })
  }

  const rateKey = `login:${resolveClientIp(req.headers) ?? 'unknown'}`
  const limit = hitRateLimit(rateKey, LIMIT)
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many attempts — try again in ${limit.retryAfter}s` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }

  let password: unknown
  try {
    password = (await req.json())?.password
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (typeof password !== 'string' || !safeEqual(password, expected)) {
    // Small delay so a wrong password isn't distinguishable by response time.
    await new Promise((r) => setTimeout(r, 300))
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  resetRateLimit(rateKey)

  const token = await createSessionToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set({ ...sessionCookieOptions, value: token })
  return res
}
