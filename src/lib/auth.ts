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
