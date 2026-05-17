import { SignJWT, jwtVerify } from 'jose'
import { cookies, headers } from 'next/headers'
import { NextRequest } from 'next/server'

const COOKIE_NAME = 'gamehub_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET not set')
  return new TextEncoder().encode(secret)
}

// ── IP detection ──────────────────────────────────────────────────────────────

export function isLocalIp(ip: string): boolean {
  // Strip IPv4-mapped IPv6 prefix (::ffff:192.168.x.x → 192.168.x.x)
  const s = ip.trim().split(',')[0].trim().replace(/^::ffff:/i, '')
  return (
    s === '127.0.0.1' ||
    s === '::1' ||
    s === 'localhost' ||
    /^192\.168\./.test(s) ||
    /^10\./.test(s) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(s)
  )
}

export function isPublicIpMatch(clientIp: string): boolean {
  const publicIp = process.env.PUBLIC_IP
  if (!publicIp) return false
  const cleanClientIp = clientIp.trim().split(',')[0].trim().replace(/^::ffff:/i, '')
  return cleanClientIp === publicIp
}

/** Extract real client IP from a NextRequest (middleware / API routes). */
function clientIpFromRequest(req: NextRequest): string {
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for') ??
    req.ip ??
    ''
  )
}

/** Extract real client IP inside a Server Component (uses next/headers). */
function clientIpFromHeaders(): string {
  const h = headers()
  return (
    h.get('x-real-ip') ??
    h.get('x-forwarded-for') ??
    ''
  )
}

// ── Token helpers ─────────────────────────────────────────────────────────────

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

// ── Public helpers ────────────────────────────────────────────────────────────

/** Used in middleware and API routes. Local-network IPs and public IP match are always admin. */
export async function getSessionFromRequest(req: NextRequest): Promise<boolean> {
  const clientIp = clientIpFromRequest(req)
  if (isLocalIp(clientIp) || isPublicIpMatch(clientIp)) return true
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return false
  return verifySessionToken(token)
}

/** Used in Server Components. Local-network IPs and public IP match are always admin. */
export async function isAdminSession(): Promise<boolean> {
  const clientIp = clientIpFromHeaders()
  if (isLocalIp(clientIp) || isPublicIpMatch(clientIp)) return true
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
