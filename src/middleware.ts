import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkAdminIp, getSessionFromRequest, ipUnknownHint } from '@/lib/auth'

// Paths that require admin auth
const ADMIN_PAGE_PREFIX = '/admin'
const PROTECTED_API_PATTERNS = [
  { method: 'POST',   path: '/api/scanner' },
  { method: 'POST',   path: '/api/games/merge' },
  { method: 'POST',   path: '/api/covers' },
  { method: 'POST',   path: '/api/metadata' },
  // GET too: the handler returns every row of the Setting table verbatim, which
  // includes s3_secret_key, rawg_api_key, youtube_api_key and the rest. Only the
  // admin screens read it, so requiring the session costs nothing.
  { method: 'GET',    path: '/api/settings' },
  { method: 'PUT',    path: '/api/settings' },
  { method: 'PATCH',  path: '/api/platforms' },
  { method: 'PATCH',  path: '/api/games' },
  { method: 'DELETE', path: '/api/games' },
  { method: 'DELETE', path: '/api/admin/graveyard' },
  { method: 'POST',   path: '/api/admin/graveyard/recover' },
  { method: 'POST',   path: '/api/admin/jobs' },   // start / cancel background jobs
  { method: 'POST',   path: '/api/admin/covers' }, // orphan-cover cleanup
  { method: 'POST',   path: '/api/admin/platforms' }, // platform icon upload
  { method: 'DELETE', path: '/api/admin/platforms' }, // platform icon removal
  { method: 'GET',    path: '/api/admin/games/export' }, // games metadata export (JSON/CSV)
  { method: 'GET',    path: '/api/admin/curation' },     // proposed file-name renames
  { method: 'POST',   path: '/api/admin/curation' },     // approve a rename plan
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

    // Optional IP allowlist. Disabled unless ADMIN_IP_ALLOWLIST (or the legacy
    // PUBLIC_IP) is set — the password + signed session is the real gate, and an
    // IP filter here protects nothing that the login route and the mutating APIs
    // don't already expose. See lib/auth.ts.
    const ipCheck = checkAdminIp(req.headers)
    if (!ipCheck.allowed) {
      console.warn(
        `[MIDDLEWARE] Admin access denied for ${pathname} — ${ipCheck.reason}` +
        (ipCheck.ip ? ` (ip=${ipCheck.ip})` : ` (${ipUnknownHint()})`),
      )
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
    '/api/admin/jobs/:path*',
    '/api/admin/covers/:path*',
    '/api/admin/platforms/:path*',
    '/api/admin/games/:path*',
  ],
}
