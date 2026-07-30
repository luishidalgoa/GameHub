/**
 * Access control shared by every `/api/shop/*` route.
 *
 * Two independent gates:
 *
 * 1. **Network** — when the client IP can be established it must be private (or
 *    listed in `TRUSTED_NETWORKS`). A request arriving through the public proxy
 *    is rejected.
 * 2. **Password** — when the `shop_password` setting is set, HTTP Basic Auth is
 *    required. This applies to *all* shop routes, index and sub-indexes
 *    included; listing the library is as sensitive as downloading from it.
 *
 * Reached directly on the LAN port (`http://<pi>:3001`, which is how Tinfoil/DBI
 * connect) there is no proxy header, so the IP is unknowable — see `lib/net.ts`.
 * That case is allowed to proceed, because refusing it would disable the feature
 * entirely, but it is exactly why `shop_password` matters: with no password and
 * no verifiable IP the only thing keeping the library private is that the port
 * is not reachable from outside. The previous implementation defaulted the
 * client IP to `127.0.0.1`, which made every "LAN only" check pass silently for
 * *any* caller in that situation.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { safeEqual } from '@/lib/auth'
import { isTrustedIp, resolveClientIp, trustProxy } from '@/lib/net'

// ── shop_password (cached) ────────────────────────────────────────────────────

const PASSWORD_TTL_MS = 15_000
let cachedPassword: { value: string; at: number } | null = null

async function shopPassword(): Promise<string> {
  const now = Date.now()
  if (cachedPassword && now - cachedPassword.at < PASSWORD_TTL_MS) return cachedPassword.value

  // A Range-heavy install hits these routes hundreds of times per file; don't
  // re-query SQLite for every chunk.
  const row = await db.setting.findUnique({ where: { key: 'shop_password' } }).catch(() => null)
  const value = row?.value?.trim() ?? ''
  cachedPassword = { value, at: now }
  return value
}

/** Call after the setting changes so the next request sees the new password. */
export function invalidateShopPasswordCache(): void {
  cachedPassword = null
}

// ── Responses ─────────────────────────────────────────────────────────────────

function unauthorized(): NextResponse {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="GameHub Shop"' },
  })
}

function forbidden(ip: string): NextResponse {
  return NextResponse.json({ error: `LAN access only (your IP: ${ip})` }, { status: 403 })
}

// ── Guard ─────────────────────────────────────────────────────────────────────

let openWarningLogged = false

/**
 * Returns a `Response` to send back when the request must be rejected, or
 * `null` when the handler may proceed.
 */
export async function guardShopRequest(req: Request): Promise<NextResponse | null> {
  const ip = resolveClientIp(req.headers)
  if (ip && !isTrustedIp(ip)) return forbidden(ip)

  const password = await shopPassword()

  if (password) {
    const header = req.headers.get('authorization') ?? ''
    if (!header.toLowerCase().startsWith('basic ')) return unauthorized()

    let decoded: string
    try {
      decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf-8')
    } catch {
      return unauthorized()
    }
    // Tinfoil/DBI send "user:password"; the username is ignored by design.
    const provided = decoded.includes(':') ? decoded.slice(decoded.indexOf(':') + 1) : decoded
    if (!safeEqual(provided, password)) return unauthorized()

    return null
  }

  if (!ip && !openWarningLogged) {
    openWarningLogged = true
    console.warn(
      '[SHOP] Serving with no shop_password and no verifiable client IP' +
      (trustProxy()
        ? ' (no forwarding header on this request — direct hit on the app port).'
        : ' (TRUST_PROXY disabled, forwarding headers ignored).') +
      ' Anyone who can reach this port can list and download the whole library.' +
      ' Set a shop password in Admin → Settings, or make sure the port is not exposed.',
    )
  }

  return null
}

// ── URL helpers ───────────────────────────────────────────────────────────────

/**
 * Absolute base URL for the URLs embedded in the index, honouring the scheme the
 * client actually used. Hardcoding `http://` breaks the index the moment the
 * shop is reached over TLS (e.g. through a VPN or a proxy).
 */
export function shopBaseUrl(req: Request): string {
  const rawHost = req.headers.get('host') ?? 'localhost'
  // Reject anything that isn't a plausible host:port — the value ends up inside
  // URLs we hand to the console.
  const host = /^[A-Za-z0-9._\-\[\]:]+$/.test(rawHost) ? rawHost : 'localhost'

  const forwardedProto = trustProxy()
    ? req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
    : undefined
  const proto = forwardedProto === 'https' ? 'https' : 'http'

  return `${proto}://${host}`
}
