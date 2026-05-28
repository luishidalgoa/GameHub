import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionFromRequest, isPublicIpRequest, isLanIp } from '@/lib/auth'

// Paths that require admin auth
const ADMIN_PAGE_PREFIX = '/admin'
const PROTECTED_API_PATTERNS = [
  { method: 'POST',   path: '/api/scanner' },
  { method: 'POST',   path: '/api/games/merge' },
  { method: 'POST',   path: '/api/covers' },
  { method: 'POST',   path: '/api/metadata' },
  { method: 'PUT',    path: '/api/settings' },
  { method: 'PATCH',  path: '/api/platforms' },
  { method: 'PATCH',  path: '/api/games' },
  { method: 'DELETE', path: '/api/games' },
  { method: 'DELETE', path: '/api/admin/graveyard' },
  { method: 'POST',   path: '/api/admin/graveyard/recover' },
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // --- Protect admin pages ---
  if (pathname.startsWith(ADMIN_PAGE_PREFIX)) {
    // Login page: accessible from anywhere (no IP restriction).
    // Use startsWith to tolerate trailing slashes or sub-paths.
    if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
      return NextResponse.next()
    }

    // Admin pages: accessible from configured public IP OR any LAN IP
    const clientIp = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for') ?? req.ip ?? ''
    console.log(`[MIDDLEWARE] Admin request to ${pathname} from IP: "${clientIp}" (x-real-ip=${req.headers.get('x-real-ip')} x-fwd=${req.headers.get('x-forwarded-for')} req.ip=${req.ip})`)
    if (!isPublicIpRequest(req) && !isLanIp(clientIp)) {
      console.log(`[MIDDLEWARE] Admin access denied from IP: ${clientIp}`)
      return NextResponse.redirect(new URL('/', req.url))
    }

    const authenticated = await getSessionFromRequest(req)
    if (!authenticated) {
      const loginUrl = new URL('/admin/login', req.url)
      // Never set `from` to the login page itself — that would cause an infinite loop
      const safeFrom = pathname.startsWith('/admin/login') ? '/admin' : pathname
      loginUrl.searchParams.set('from', safeFrom)
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
    '/api/admin/graveyard/:path*',
  ],
}
