import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import {
  isIpInAnyCidr,
  isTrustedIp,
  parseCidrList,
  resolveClientIp,
  trustProxy,
  type HeaderReader,
} from '@/lib/net'

const COOKIE_NAME = 'gamehub_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET not set')
  return new TextEncoder().encode(secret)
}

// ── Constant-time comparison ──────────────────────────────────────────────────

/**
 * Compare two secrets without leaking their content through timing.
 * Pure JS (no `node:crypto`) so it also works in the Edge middleware runtime.
 * The length difference is still observable — acceptable for a shared password.
 */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const A = enc.encode(a)
  const B = enc.encode(b)
  let diff = A.length ^ B.length
  const len = Math.max(A.length, B.length)
  for (let i = 0; i < len; i++) diff |= (A[i] ?? 0) ^ (B[i] ?? 0)
  return diff === 0
}

// ── Admin IP policy ───────────────────────────────────────────────────────────

/**
 * Optional IP allowlist for the `/admin` UI.
 *
 * **Disabled by default, on purpose.** What actually protects the admin area is
 * `ADMIN_PASSWORD` + the signed session cookie: `/admin/login` is reachable from
 * anywhere and every mutating API route is gated on the session alone, so an IP
 * filter over the page routes stops nobody who has the password — it only locks
 * out the operator when their own address is not what the filter expects.
 * Put the admin behind a VPN if you want a network perimeter.
 *
 * - `ADMIN_IP_ALLOWLIST` — comma separated IPs/CIDRs (v4 and v6). Authoritative:
 *   list your LAN range explicitly, e.g. `192.168.1.0/24,10.8.0.0/24`.
 * - `PUBLIC_IP` — legacy single address. Kept working with its original meaning
 *   ("this address **or** any private/trusted network").
 */
export interface AdminIpPolicy {
  enabled:      boolean
  cidrs:        string[]
  /** Legacy mode also accepts any private / `TRUSTED_NETWORKS` address. */
  allowTrusted: boolean
}

export function adminIpPolicy(): AdminIpPolicy {
  const explicit = parseCidrList(process.env.ADMIN_IP_ALLOWLIST)
  if (explicit.length > 0) {
    return { enabled: true, cidrs: explicit, allowTrusted: false }
  }
  const legacy = parseCidrList(process.env.PUBLIC_IP)
  if (legacy.length > 0) {
    return { enabled: true, cidrs: legacy, allowTrusted: true }
  }
  return { enabled: false, cidrs: [], allowTrusted: true }
}

export interface AdminIpCheck {
  allowed: boolean
  /** Resolved client IP, or null when it could not be established. */
  ip:      string | null
  /** Machine-readable outcome, safe to log. */
  reason:  'gate-disabled' | 'in-allowlist' | 'trusted-network' | 'not-in-allowlist' | 'ip-unknown'
}

/**
 * Decide whether a request may reach the admin UI, based on IP only.
 * Never throws; when the gate is disabled every request passes.
 */
export function checkAdminIp(headers: HeaderReader): AdminIpCheck {
  const policy = adminIpPolicy()
  const ip = resolveClientIp(headers)

  if (!policy.enabled) return { allowed: true, ip, reason: 'gate-disabled' }
  // The gate cannot be enforced without a resolvable IP. Fail closed — the
  // operator asked for a filter — and say why in the log.
  if (!ip) return { allowed: false, ip: null, reason: 'ip-unknown' }
  if (isIpInAnyCidr(ip, policy.cidrs)) return { allowed: true, ip, reason: 'in-allowlist' }
  if (policy.allowTrusted && isTrustedIp(ip)) return { allowed: true, ip, reason: 'trusted-network' }
  return { allowed: false, ip, reason: 'not-in-allowlist' }
}

/** Human-readable hint for the `ip-unknown` case — printed once per denial. */
export function ipUnknownHint(): string {
  return trustProxy()
    ? 'no usable X-Real-IP / X-Forwarded-For header reached the app — check the reverse proxy config'
    : 'TRUST_PROXY is not enabled, so forwarding headers are ignored; set TRUST_PROXY=true when running behind Apache/nginx, or clear ADMIN_IP_ALLOWLIST/PUBLIC_IP to disable the IP gate'
}

// ── Session ───────────────────────────────────────────────────────────────────

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ admin: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret())
    return true
  } catch {
    return false
  }
}

/** Used in middleware and API routes. Requires valid session token. */
export async function getSessionFromRequest(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return false
  return verifySessionToken(token)
}

/** Used in Server Components. Requires valid session token. */
export async function isAdminSession(): Promise<boolean> {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token) return false
  return verifySessionToken(token)
}

export const sessionCookieOptions = {
  name:     COOKIE_NAME,
  maxAge:   COOKIE_MAX_AGE,
  httpOnly: true,
  sameSite: 'lax' as const,
  path:     '/',
  secure:   process.env.NODE_ENV === 'production',
}
