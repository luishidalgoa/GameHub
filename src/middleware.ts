import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionFromRequest, isLocalIp } from '@/lib/auth'

// Paths that require admin auth
const ADMIN_PAGE_PREFIX = '/admin'
const PROTECTED_API_PATTERNS = [
  { method: 'POST',   path: '/api/scanner' },
  { method: 'POST',   path: '/api/covers' },
  { method: 'POST',   path: '/api/metadata' },
  { method: 'PUT',    path: '/api/settings' },
  { method: 'PATCH',  path: '/api/platforms' },
  { method: 'PATCH',  path: '/api/games' },
  { method: 'DELETE', path: '/api/games' },
  { method: 'DELETE', path: '/api/admin/graveyard' },
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // --- Protect admin pages ---
  if (pathname.startsWith(ADMIN_PAGE_PREFIX)) {
    // Login page: only accessible from the local network
    if (pathname === '/admin/login') {
      const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for') ?? req.ip ?? ''
      if (!isLocalIp(ip)) return new NextResponse(null, { status: 404 })
      return NextResponse.next()
    }

    const authenticated = await getSessionFromRequest(req)
    if (!authenticated) {
      const loginUrl = new URL('/admin/login', req.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  // --- Protect mutating API routes ---
  const isProtectedApi = PROTECTED_API_PATTERNS.some(
    (p) => req.method === p.method && pathname.startsWith(p.path)
  )

  if (isProtectedApi) {
    const authenticated = await getSessionFromRequest(req)
    if (!authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/scanner/:path*',
    '/api/covers/:path*',
    '/api/metadata/:path*',
    '/api/settings/:path*',
    '/api/platforms/:path*',
    '/api/games/:path*',
    '/api/admin/fs/:path*',
    '/api/admin/graveyard',
  ],
}
