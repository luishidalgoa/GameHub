import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

const COOKIE_NAME = 'gamehub_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET not set')
  return new TextEncoder().encode(secret)
}

// ── LAN IP detection ─────────────────────────────────────────────────────────

/** Returns true for RFC-1918 private ranges and loopback. */
export function isLanIp(ip: string): boolean {
  const clean = ip.trim().split(',')[0].trim().replace(/^::ffff:/i, '')
  if (clean === '127.0.0.1' || clean === '::1') return true
  if (clean.startsWith('192.168.')) return true
  if (clean.startsWith('10.')) return true
  const parts = clean.split('.')
  if (parts.length === 4 && parts[0] === '172') {
    const b = parseInt(parts[1], 10)
    if (b >= 16 && b <= 31) return true
  }
  return false
}

/** Extract client IP from a plain Request (not NextRequest). */
export function clientIpFromPlainRequest(req: Request): string {
  const h = req.headers as unknown as { get: (k: string) => string | null }
  return (
    h.get('x-real-ip') ??
    h.get('x-forwarded-for') ??
    '127.0.0.1'
  )
}

// ── Public IP detection ───────────────────────────────────────────────────────

export function isPublicIp(clientIp: string): boolean {
  const publicIp = process.env.PUBLIC_IP
  // If PUBLIC_IP is not configured, skip IP restriction (dev / unconfigured instances)
  if (!publicIp) return true
  const cleanClientIp = clientIp.trim().split(',')[0].trim().replace(/^::ffff:/i, '')
  return cleanClientIp === publicIp
}

function clientIpFromRequest(req: NextRequest): string {
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for') ??
    req.ip ??
    ''
  )
}

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

/** Used in middleware and API routes. Requires valid session token. */
export async function getSessionFromRequest(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return false
  return verifySessionToken(token)
}

export function isPublicIpRequest(req: NextRequest): boolean {
  return isPublicIp(clientIpFromRequest(req))
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
